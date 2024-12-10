import { Box2, Box3, Vector2 } from 'three'
import workerpool, { Pool } from 'workerpool'

import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer'
import { WorldEnv, WorldUtils } from '../index'
import { SpawnedItems } from '../misc/ItemsInventory'
import {
  ChunkId,
  ChunkKey,
  GroundBlock,
  PatchId,
  PatchKey,
} from '../utils/types'

import { ComputeTask } from './world-compute'

export type ComputeParams = Partial<{
  rememberMe: boolean // allow for caching value
  preCacheRadius: number // pre-caching next requests
  includeEntitiesBlocks: boolean // skip or include entities blocks
}>

/**
 * World API frontend proxying requests to internal modules: world-compute, world-cache,
 * Compute requests are proxied to worker pool or fallback to main thread
 */
export class WorldComputeProxy {
  // implements WorldComputeInterface {
  // eslint-disable-next-line no-use-before-define
  static defaultProxy: WorldComputeProxy
  // eslint-disable-next-line no-use-before-define
  static customProxy: WorldComputeProxy
  // eslint-disable-next-line no-use-before-define
  static workerPool: Pool
  // static tasksQueue: ComputeTask[]

  constructor(
    workerUrl?: string,
    workerCount?: number,
    // eslint-disable-next-line no-undef
    workerType?: WorkerType,
  ) {
    const { url, count, type } = WorldEnv.current.workerPool
    workerUrl = workerUrl || url
    if (workerUrl && workerUrl.length > 0) {
      workerCount = workerCount || count
      workerType = workerType || type
      // eslint-disable-next-line no-undef
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
    // else {
    // }
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

  // async *iterPatchCompute(patchKeysBatch: string[]) {
  //   throw new Error('Method not implemented.')
  // }

  async bakeGroundPatch(boundsOrPatchKey: string | Box2) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.PatchCompute, [boundsOrPatchKey])
      .then(res => {
        return res
      })
  }

  async bakeItemsChunkLayer(patchBounds: Box2) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.BakeItemsChunkLayer, [patchBounds])
      .then(chunkStub => ChunkContainer.fromStub(chunkStub))
  }

  async bakeCavesMask(chunkBounds: ChunkKey | Box3) {
    return WorldComputeProxy.workerPool
      .exec(ComputeTask.BakeCavesMask, [chunkBounds])
      .then(chunkStub => ChunkContainer.fromStub(chunkStub))
  }

  async bakeSurfaceChunks(patchKey: PatchKey) {
    const stubs: ChunkStub[] = await WorldComputeProxy.workerPool.exec(
      ComputeTask.BakeSurfaceChunks,
      [patchKey],
    )
    const chunks = stubs.map(chunkStub => ChunkContainer.fromStub(chunkStub))
    return chunks
  }

  async bakeUndergroundChunk(
    patchOrChunkId: PatchId | ChunkId,
    genParams = { noEncoder: false },
  ) {
    const chunkStub: ChunkStub = await WorldComputeProxy.workerPool.exec(
      ComputeTask.BakeUndergroundChunk,
      [patchOrChunkId, genParams],
    )
    const undergroundChunk = ChunkContainer.fromStub(chunkStub)
    return undergroundChunk
  }

  async queryOvergroundItems(queriedRegion: Box2): Promise<SpawnedItems> {
    return WorldComputeProxy.workerPool.exec(ComputeTask.OvergroundItemsQuery, [
      queriedRegion,
    ])
    // .then((res: Record<ItemType, Vector3[]>) => {
    //   return res as Record<ItemType, Vector3[]>
    // })
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
