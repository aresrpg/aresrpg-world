import { WorldLocals } from '../config/WorldEnv.js'

import { TaskId, GenericTask } from './TaskProcessing.js'

export type MessageData<T> = {
  timestamp: number
  content: T
}

/**
 * Interface to interact and proxy requests to worker
 */
export class WorkerProxy {
  id
  worker: any // will be available when worker is ready
  resolvers: Record<TaskId, any> = {}

  // abstract initWorker(workerUrl: string | URL): WorkerType
  constructor(workerId = 0) {
    this.id = workerId
  }

  /**
   * 
   * @param worldLocalEnv 
   * @param worker allow for passing worker externally to workaround issue with some bundlers
   * @returns 
   */
  init(worldLocalEnv: WorldLocals, externalWorker?: Worker) {
    externalWorker && console.warn(`externally provided worker`)
    const workerUrl = new URL('./world_compute_worker', import.meta.url)
    // eslint-disable-next-line no-undef
    const worker = externalWorker || new Worker(workerUrl, { type: 'module' })
    worker.onmessage = workerReply => this.handleWorkerReply(workerReply.data)
    worker.onerror = error => {
      console.error('WorldComputeProxy worker error', error)
    }
    worker.onmessageerror = error => {
      console.error('WorldComputeProxy worker messageerror', error)
    }
    this.worker = worker
    const timestamp = Date.now()
    const pendingInit = new Promise<any>(
      resolve => (this.resolvers[timestamp] = resolve),
    )
    this.worker.postMessage({ timestamp, content: worldLocalEnv.toStub() })
    pendingInit.then(() => console.log(`worker #${this.id} is ready`))
    return pendingInit
  }

  handleWorkerReply = (reply: MessageData<any>) => {
    const { timestamp, content } = reply
    if (timestamp !== undefined) {
      const msgResolver = this.resolvers[timestamp]
      if (msgResolver) {
        msgResolver(content.data)
        delete this.resolvers[timestamp]
      } else {
        console.warn(`missing message resolver ${timestamp} for worker #${this.id}`)
      }
    }
  }

  get isReady() {
    const isBusy = () => Object.keys(this.resolvers).length > 0
    return this.worker && !isBusy()
  }

  get pendingRequests() {
    return Object.keys(this.resolvers)
  }

  async forwardTask(task: GenericTask) {
    if (this.worker && this.isReady) {
      const timestamp = Date.now()
      // task?.onProcessingStart()
      const content = task.toStub()
      this.resolvers[timestamp] = task.resolve
      this.worker.postMessage({ timestamp, content })
      return true
    }
    return false
  }
}
