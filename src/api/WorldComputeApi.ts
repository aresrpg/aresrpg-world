import { Box2, Vector3 } from 'three'

import { Block, EntityKey, PatchKey } from '../common/types'
import { EntityChunk } from '../datacontainers/EntityChunkMaker'
import { BlocksPatch, WorldCompute, WorldUtils } from '../index'

export enum ComputeApiCall {
  PatchCompute = 'bakeGroundPatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
  BakeEntities = 'bakeEntities'
}

export type ComputeApiParams = Partial<{
  rememberMe: boolean // allow for caching value
  preCacheRadius: number // pre-caching next requests
  includeEntitiesBlocks: boolean // skip or include entities blocks
}>

/**
 * All methods exposed here supports worker mode and will forward
 * requests to external compute module if worker instance is provided
 */
export class WorldComputeApi {
  static singleton: WorldComputeApi
  workerInstance: Worker | undefined
  resolvers: Record<number, any> = {}
  count = 0

  static get instance() {
    this.singleton = this.singleton || new WorldComputeApi()
    return this.singleton
  }

  get worker() {
    return this.workerInstance
  }

  set worker(workerInstance: Worker) {
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
    this.workerInstance = workerInstance
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
        )?.then(patchStub => BlocksPatch.fromStub(patchStub)) as BlocksPatch

      yield patch
    }
  }

  async bakeEntities(queriedRange: Box2,) {
    const entityChunks = !this.worker ?
      WorldCompute.bakeEntities(queriedRange) :
      await this.workerCall(
        ComputeApiCall.BakeEntities,
        [queriedRange],
      )?.then((entityChunks: EntityChunk[]) =>
        // parse worker's data to recreate original objects
        entityChunks.map(chunkStub => {
          chunkStub.box = WorldUtils.parseThreeStub(chunkStub.box)
          if (chunkStub.entity) {
            chunkStub.entity.bbox = WorldUtils.parseThreeStub(chunkStub.entity?.bbox)
          }
          return chunkStub
        })) as EntityChunk[]

    return entityChunks
  }
}
