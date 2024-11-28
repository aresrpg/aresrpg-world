import { Box2, Vector3, Box3, Vector2 } from 'three'
import workerpool, { Pool } from 'workerpool'
import { WorldEnv, WorldUtils } from '..'
import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer'
import { GroundPatch } from '../datacontainers/GroundPatch'
import { PatchKey, ChunkKey, GroundBlock } from '../utils/types'
import { ComputeTask } from './world-compute'

export type ComputeParams = Partial<{
  rememberMe: boolean // allow for caching value
  preCacheRadius: number // pre-caching next requests
  includeEntitiesBlocks: boolean // skip or include entities blocks
}>

export type WorkerTask = {
  id: number,
  name: ComputeTask,
  args: any[]
}

export interface WorldComputeInterface {
  queryOvergroundItems(queriedRegion: Box2): Promise<Record<string, Vector3[]>>

  iterPatchCompute(patchKeysBatch: PatchKey[]): AsyncGenerator<GroundPatch, void, unknown>

  bakeGroundPatch(boundsOrPatchKey: Box2 | string): Promise<GroundPatch>

  bakeOvergroundChunk(patchBounds: Box2): Promise<ChunkStub>

  bakeUndergroundCaverns(chunkBounds: ChunkKey | Box3): Promise<ChunkStub>

  computeBlocksBatch(blockPosBatch: Vector2[], params: any): Promise<GroundBlock[]>
}

/**
 * World API frontend proxying requests to internal modules: world-compute, world-cache,
 * Compute requests are proxied to worker pool or fallback to main thread
 */
export class WorldComputeProxy implements WorldComputeInterface {
  // eslint-disable-next-line no-use-before-define
  static defaultProxy: WorldComputeProxy
  static customProxy: WorldComputeProxy
  // eslint-disable-next-line no-use-before-define
  static workerPool: Pool
  // static tasksQueue: ComputeTask[]
  // eslint-disable-next-line no-undef

  constructor(workerUrl?: string, workerCount?: number, workerType?: WorkerType) {
    const { url, count, type } = WorldEnv.current.workerPool
    workerUrl = workerUrl || url
    if (workerUrl.length > 0) {
      workerCount = workerCount || count
      workerType = workerType || type
      const workerOpts: WorkerOptions = {}
      if (workerType) {
        // By default, Vite uses a module worker in dev mode, which can cause your application to fail. Therefore, we need to use a module worker in dev mode and a classic worker in prod mode.
        workerOpts.type = workerType
      }
      WorldComputeProxy.workerPool = workerpool.pool(workerUrl, {
        maxWorkers: workerCount,
        workerOpts,
      })
    }
    // TODO: default to main thread
    else {

    }
  }

  static get default() {
    this.defaultProxy = this.defaultProxy || new WorldComputeProxy()
    return this.defaultProxy
  }

  static get current() {
    return this.customProxy || this.default
  }

  static set current(customProxy) {
    this.customProxy = customProxy
  }

  // static get custom() {
  //   this.defaultProxy = this.defaultProxy || new WorldComputeProxy()
  //   return this.defaultProxy
  // }

  async queryOvergroundItems(queriedRegion: Box2) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.OvergroundItemsQuery, [queriedRegion])
      .then((res) => {
        return res
      })
  }

  async *iterPatchCompute(patchKeysBatch: string[]) {
    throw new Error('Method not implemented.')
  }

  async bakeGroundPatch(boundsOrPatchKey: string | Box2) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.PatchCompute, [boundsOrPatchKey])
      .then((res) => {
        return res
      })
  }

  async bakeOvergroundChunk(patchBounds: Box2) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.BakeMergeOvergroundItems, [patchBounds])
      .then(chunkStub => ChunkContainer.fromStub(chunkStub))
  }

  async bakeUndergroundCaverns(chunkBounds: string | Box3) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.BakeUndergroundCaverns, [chunkBounds])
      .then(chunkStub => ChunkContainer.fromStub(chunkStub))
  }

  async computeBlocksBatch(blockPosBatch: Vector2[], params: any) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.BlocksBatchCompute, [blockPosBatch, params])
      .then((blocksStubs: GroundBlock[]) => {
        // parse worker's data to recreate original objects
        const blocks = blocksStubs.map(blockStub => {
          blockStub.pos = WorldUtils.parseThreeStub(blockStub.pos)
          return blockStub
        }) as GroundBlock[]
        return blocks
      })
  }

}
