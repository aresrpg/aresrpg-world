import { Box2, Vector3 } from 'three'

import { Block, EntityKey, PatchKey } from '../common/types'
import { BoardContainer, BoardParams } from '../datacontainers/BoardContainer'
import { EntityChunk, EntityChunkStub } from '../datacontainers/EntityChunk'
import { BlocksPatch, GroundPatch, WorldCompute, WorldUtils } from '../index'

export enum ComputeApiCall {
  PatchCompute = 'bakeGroundPatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
  BakeEntities = 'queryBakeEntities',
  BattleBoardCompute = 'computeBoardData'
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
  static singleton: WorldComputeProxy
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
    return
  }

  async computeBlocksBatch(
    blockPosBatch: Vector3[],
    params = { includeEntitiesBlocks: false },
  ) {
    const blocks = !this.worker ?
      WorldCompute.computeBlocksBatch(blockPosBatch, params) :
      await this.workerCall(
        ComputeApiCall.BlocksBatchCompute,
        [blockPosBatch, params],
      )?.then((blocksStubs: Block[]) =>
        // parse worker's data to recreate original objects
        blocksStubs.map(blockStub => {
          blockStub.pos = WorldUtils.parseThreeStub(blockStub.pos)
          return blockStub
        })) as Block[]

    return blocks
  }

  // *iterEntitiesBaking(entityKeys: EntityKey[]) {
  //   for (const entityKey of entityKeys) {
  //     const entityChunk = WorldCompute.bakeChunkEntity(entityKey)
  //     yield entityChunk
  //   }
  // }

  async *iterPatchCompute(patchKeysBatch: PatchKey[]) {
    for (const patchKey of patchKeysBatch) {
      const patch = !this.worker ? WorldCompute.bakeGroundPatch(patchKey) :
        await this.workerCall(
          ComputeApiCall.PatchCompute,
          [patchKey], // [emptyPatch.bbox]
        )?.then(patchStub => new GroundPatch().fromStub(patchStub)) as GroundPatch

      yield patch
    }
  }

  async bakeEntities(queriedRange: Box2,) {
    const entityChunks = !this.worker ?
      WorldCompute.queryBakeEntities(queriedRange) :
      await this.workerCall(
        ComputeApiCall.BakeEntities,
        [queriedRange],
      )?.then((entityChunks: EntityChunkStub[]) =>
        // parse worker's data to recreate original objects
        entityChunks.map(chunkStub => EntityChunk.fromStub(chunkStub)))
    return entityChunks
  }

  async requestBattleBoard(boardCenter: Vector3, boardParams: BoardParams) {
    const boardData = !this.worker ?
      WorldCompute.computeBoardData(boardCenter, boardParams) :
      await this.workerCall(
        ComputeApiCall.BattleBoardCompute,
        [boardCenter, boardParams],
      )
    const board = new BoardContainer().fromStub(boardData)
    return board
  }
}
