import { Box2, Vector3 } from 'three'

import { Block, EntityData, PatchKey } from '../common/types'
import { EntityChunk, EntityChunkStub } from '../datacontainers/EntityChunk'
import { GroundPatch, WorldCompute, WorldUtils } from '../index'
import { parseThreeStub } from '../common/utils'

export enum ComputeApiCall {
  PatchCompute = 'bakeGroundPatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
  QueryEntities = 'queryEntities',
  BakeEntities = 'queryBakeEntities',
  BattleBoardCompute = 'computeBoardData',
}

export type ComputeApiParams = Partial<{
  rememberMe: boolean // allow for caching value
  preCacheRadius: number // pre-caching next requests
  includeEntitiesBlocks: boolean // skip or include entities blocks
}>

/**
 * Exposing world compute api with ability to run inside optional worker
 * When provided all request are proxied to worker instead of main thread
 */
export class WorldComputeProxy {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldComputeProxy
  // eslint-disable-next-line no-undef
  workerInstance: Worker | undefined
  resolvers: Record<number, any> = {}
  count = 0

  static get instance() {
    this.singleton = this.singleton || new WorldComputeProxy()
    return this.singleton
  }

  get worker() {
    return this.workerInstance
  }

  // eslint-disable-next-line no-undef
  set worker(workerInstance: Worker | undefined) {
    this.workerInstance = workerInstance
    if (workerInstance) {
      workerInstance.onmessage = ({ data }) => {
        if (data.id !== undefined) {
          this.resolvers[data.id]?.(data.data)
          delete this.resolvers[data.id]
        }
      }

      workerInstance.onerror = error => {
        console.error(error)
      }

      workerInstance.onmessageerror = error => {
        console.error(error)
      }
    }
  }

  /**
   * Proxying request to worker
   */
  workerCall(apiName: ComputeApiCall, args: any[]) {
    if (this.worker) {
      const id = this.count++
      this.worker.postMessage({ id, apiName, args })
      return new Promise<any>(resolve => (this.resolvers[id] = resolve))
    }
    return null
  }

  async computeBlocksBatch(
    blockPosBatch: Vector3[],
    params = { includeEntitiesBlocks: false },
  ) {
    const blocks = !this.worker
      ? WorldCompute.computeBlocksBatch(blockPosBatch, params)
      : ((await this.workerCall(ComputeApiCall.BlocksBatchCompute, [
          blockPosBatch,
          params,
        ])?.then((blocksStubs: Block[]) =>
          // parse worker's data to recreate original objects
          blocksStubs.map(blockStub => {
            blockStub.pos = WorldUtils.parseThreeStub(blockStub.pos)
            return blockStub
          }),
        )) as Block[])

    return blocks
  }

  // *iterEntitiesBaking(entityKeys: EntityKey[]) {
  //   for (const entityKey of entityKeys) {
  //     const entityChunk = WorldCompute.bakeChunkEntity(entityKey)
  //     yield entityChunk
  //   }
  // }

  async queryEntities(queriedRegion: Box2) {
    // const entitiesData = !this.worker
    //   ? WorldCompute.queryEntities(queriedRegion)
    //   : ((await this.workerCall(
    //       ComputeApiCall.QueryEntities,
    //       [queriedRegion], // [emptyPatch.bbox]
    //     )?.then(stubs =>
    //       stubs.map((stub: EntityData) => ({
    //         ...stub,
    //         bbox: parseThreeStub(stub.bbox),
    //       })),
    //     )) as EntityData[])
    return [] //entitiesData
  }

  async *iterPatchCompute(patchKeysBatch: PatchKey[]) {
    for (const patchKey of patchKeysBatch) {
      const patch = !this.worker
        ? WorldCompute.bakeGroundPatch(patchKey)
        : ((await this.workerCall(
            ComputeApiCall.PatchCompute,
            [patchKey], // [emptyPatch.bbox]
          )?.then(patchStub =>
            new GroundPatch().fromStub(patchStub),
          )) as GroundPatch)

      yield patch
    }
  }

  async bakeGroundPatch(boundsOrPatchKey: Box2 | string) {
    const patchStub = !this.worker
      ? WorldCompute.bakeGroundPatch(boundsOrPatchKey)
      : await this.workerCall(ComputeApiCall.PatchCompute, [boundsOrPatchKey])
    // ?.then(patchStub => new GroundPatch().fromStub(patchStub)) as GroundPatch

    return patchStub
  }

  async bakeEntities(queriedRange: Box2) {
    // const entityChunks = !this.worker
    //   ? WorldCompute.queryBakeEntities(queriedRange)
    //   : await this.workerCall(ComputeApiCall.BakeEntities, [
    //       queriedRange,
    //     ])?.then((entityChunks: EntityChunkStub[]) =>
    //       // parse worker's data to recreate original objects
    //       entityChunks.map(chunkStub => EntityChunk.fromStub(chunkStub)),
    //     )
    return []//entityChunks
  }

  // async requestBattleBoard(boardCenter: Vector3, boardParams: BoardParams, lastBoardBounds: Box2) {
  //   const boardData = !this.worker ?
  //     WorldCompute.computeBoardData(boardCenter, boardParams, lastBoardBounds) :
  //     await this.workerCall(
  //       ComputeApiCall.BattleBoardCompute,
  //       [boardCenter, boardParams, lastBoardBounds],
  //     )
  //   const board = new BoardContainer().fromStub(boardData)
  //   return board
  // }
}
