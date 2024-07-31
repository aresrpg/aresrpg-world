import { WorldCompute } from './WorldCompute'
import { PatchStub } from './WorldPatch'

export enum WorldApiMethods {
  PatchCompute = 'patchCompute',
}

export interface WorldApiProvider {
  iterBatchProcess(
    batchContent: string[],
  ): AsyncGenerator<PatchStub, void, unknown>
}

/**
 * Frontend to access world api defaulting to using local world instance
 * can be overriden to provide custom implementation
 */
export class WorldApi implements WorldApiProvider {
  async *iterBatchProcess(batchContent: string[]) {
    for (const patchKey of batchContent) {
      const patchStub = WorldCompute.buildPatch(patchKey)
      yield patchStub
    }
  }
}

/**
 * World api provider to access worker instance
 */
export class WorldWorkerApi implements WorldApiProvider {
  // static singleton: WorldWorkerApi
  // eslint-disable-next-line no-undef
  worker: Worker
  count = 0
  resolvers: Record<number, any> = {}

  // eslint-disable-next-line no-undef
  constructor(worker: Worker) {
    this.worker = worker
    this.worker.onmessage = ({ data }) => {
      if (data.id !== undefined) {
        this.resolvers[data.id]?.(data)
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

  async *iterBatchProcess(batchContent: string[]) {
    for (const patchKey of batchContent) {
      const res: any = await this.callApi(WorldApiMethods.PatchCompute, [
        patchKey,
      ])
      yield res.data as PatchStub
    }
  }

  // static get instance() {
  //     WorldWorkerApi.singleton =
  //         WorldWorkerApi.singleton || new WorldWorkerApi()
  //     return WorldWorkerApi.singleton
  // }

  callApi(api: WorldApiMethods, args: any[]) {
    const id = this.count++
    this.worker.postMessage({ id, api, args })
    return new Promise(resolve => (this.resolvers[id] = resolve))
  }
}
