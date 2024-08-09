import { WorldCompute } from './WorldCompute'

export enum WorldApiName {
  PatchCompute = 'computePatch',
  BlocksBatchCompute = 'computeBlocksBatch',
  GroundBlockCompute = 'computeGroundBlock',
  OvergroundBufferCompute = 'computeOvergroundBuffer',
}

/**
 * Frontend to access world api defaulting to using local world instance
 * can be overriden to provide custom implementation
 */
export class WorldApi {
  // eslint-disable-next-line no-use-before-define
  static usedApi: WorldApi

  static get instance() {
    WorldApi.usedApi = WorldApi.usedApi || new WorldApi()
    return WorldApi.usedApi
  }

  // call<T>(api: WorldApiName, args: any[]): T | Promise<T>

  async call(apiName: WorldApiName, args: any) {
    return await WorldCompute[apiName](args[0])
  }
}

/**
 * World api provider to access worker instance
 */
export class WorldWorkerApi extends WorldApi {
  // static usedApi: WorldWorkerApi
  // eslint-disable-next-line no-undef
  worker: Worker
  count = 0
  resolvers: Record<number, any> = {}

  // eslint-disable-next-line no-undef
  constructor(worker: Worker) {
    super()
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

  override call(apiName: WorldApiName, args: any[]) {
    const id = this.count++
    this.worker.postMessage({ id, apiName, args })
    return new Promise<any>(resolve => (this.resolvers[id] = resolve))
  }

  // static get instance() {
  //     WorldWorkerApi.usedApi =
  //         WorldWorkerApi.usedApi || new WorldWorkerApi()
  //     return WorldWorkerApi.usedApi
  // }
}
