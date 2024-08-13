import { Vector3 } from "three"
import { PatchKey } from "../common/types"
import { BlockData, BlocksPatch } from "../data/DataContainers"
import { BlockType, WorldCompute } from "../index"

export enum ComputeApiCall {
  PatchCompute = 'computePatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  GroundBlockCompute = 'computeGroundBlock',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
}

interface ComputeApiInterface {
  computeBlocksBatch(blockPosBatch: Vector3[], params?: any): BlockData[] | Promise<BlockData[]>
  // computePatch(patchKey: PatchKey): BlocksPatch | Promise<BlocksPatch>
  iterPatchCompute(patchKeysBatch: PatchKey[]): Generator<BlocksPatch, void, unknown> | AsyncGenerator<BlocksPatch, void, unknown>
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

  static set worker(worker: Worker) {
    this.singleton = new WorldComputeProxy(worker)
  }

  computeBlocksBatch(blockPosBatch: Vector3[], params = { includeEntitiesBlocks: true }) {
    const blocksBatch = blockPosBatch.map(({ x, z }) => {
      const block_pos = new Vector3(x, 0, z)
      const block = WorldCompute.computeGroundBlock(block_pos)
      if (params.includeEntitiesBlocks) {
        const blocksBuffer = WorldCompute.computeBlocksBuffer(block_pos)
        const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
        if (lastBlockIndex >= 0) {
          block.pos.y += lastBlockIndex
          block.type = blocksBuffer[lastBlockIndex] as BlockType
        }
      }
      return block
    })
    return blocksBatch
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
    return blockStubs as BlockData[]
  }

  async *iterPatchCompute(patchKeysBatch: PatchKey[]) {
    for (const patchKey of patchKeysBatch) {
      // const emptyPatch = new BlocksPatch(patchKey)
      const patchStub = await this.workerCall(
        ComputeApiCall.PatchCompute,
        [patchKey] //[emptyPatch.bbox]
      )
      const patch = BlocksPatch.fromStub(patchStub)
      yield patch
    }
  }
}