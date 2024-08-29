import { Vector3 } from 'three'

import { Block, PatchKey } from '../common/types'
import { BlocksPatchContainer, WorldCompute, WorldUtils } from '../index'

export enum ComputeApiCall {
  PatchCompute = 'computePatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  GroundBlockCompute = 'computeGroundBlock',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
}

export type ComputeApiParams = Partial<{
  rememberMe: boolean // allow for caching value
  preCacheRadius: number // pre-caching next requests
  includeEntitiesBlocks: boolean // skip or include entities blocks
}>

interface ComputeApiInterface {
  computeBlocksBatch(
    blockPosBatch: Vector3[],
    params?: any,
  ): Block[] | Promise<Block[]>
  // computePatch(patchKey: PatchKey): BlocksPatchContainer | Promise<BlocksPatchContainer>
  iterPatchCompute(
    patchKeysBatch: PatchKey[],
  ):
    | Generator<BlocksPatchContainer, void, unknown>
    | AsyncGenerator<BlocksPatchContainer, void, unknown>
}

export class WorldComputeApi implements ComputeApiInterface {
  static singleton: ComputeApiInterface

  pendingTask = false
  startTime = Date.now()
  elapsedTime = 0
  count = 0

  static get instance() {
    this.singleton = this.singleton || new WorldComputeApi()
    return this.singleton
  }

  // eslint-disable-next-line no-undef
  static useWorker(worker: Worker) {
    this.singleton = new WorldComputeProxy(worker)
  }

  computeBlocksBatch(
    blockPosBatch: Vector3[],
    params = { includeEntitiesBlocks: true },
  ) {
    return WorldCompute.computeBlocksBatch(blockPosBatch, params)
  }

  *iterPatchCompute(patchKeysBatch: PatchKey[]) {
    for (const patchKey of patchKeysBatch) {
      const patch = WorldCompute.computePatch(patchKey)
      yield patch
    }
  }
}

/**
 * Proxying requests to worker instead of internal world compute
 */
export class WorldComputeProxy implements ComputeApiInterface {
  // eslint-disable-next-line no-undef
  worker: Worker
  count = 0
  resolvers: Record<number, any> = {}

  // eslint-disable-next-line no-undef
  constructor(worker: Worker) {
    // super()
    this.worker = worker
    this.worker.onmessage = ({ data }) => {
      if (data.id !== undefined) {
        this.resolvers[data.id]?.(data.data)
        delete this.resolvers[data.id]
      } else {
        if (data) {
          // data.kept?.length > 0 && PatchBlocksCache.cleanDeprecated(data.kept)
          // data.created?.forEach(blocks_cache => {
          //   const blocks_patch = new PatchBlocksCache(blocks_cache)
          //   PatchBlocksCache.instances.push(blocks_patch)
          //   // patchRenderQueue.push(blocksPatch)
          // })
        }
      }
    }

    this.worker.onerror = error => {
      console.error(error)
    }

    this.worker.onmessageerror = error => {
      console.error(error)
    }
  }

  workerCall(apiName: ComputeApiCall, args: any[]) {
    const id = this.count++
    this.worker.postMessage({ id, apiName, args })
    return new Promise<any>(resolve => (this.resolvers[id] = resolve))
  }

  async computeBlocksBatch(blockPosBatch: Vector3[], params?: any) {
    const blockStubs = await this.workerCall(
      ComputeApiCall.BlocksBatchCompute,
      [blockPosBatch, params],
    )
    // parse worker's data to recreate original objects
    const blocks: Block[] = blockStubs.map((blockStub: Block) => {
      blockStub.pos = WorldUtils.parseThreeStub(blockStub.pos)
      return blockStub
    })
    return blocks
  }

  async *iterPatchCompute(patchKeysBatch: PatchKey[]) {
    for (const patchKey of patchKeysBatch) {
      // const emptyPatch = new BlocksPatchContainer(patchKey)
      const patchStub = await this.workerCall(
        ComputeApiCall.PatchCompute,
        [patchKey], // [emptyPatch.bbox]
      )
      const patch = BlocksPatchContainer.fromStub(patchStub)
      yield patch
    }
  }
}
