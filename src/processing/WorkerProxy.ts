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
  workerName
  worker: any // will be available when worker is ready
  resolvers: Record<TaskId, any> = {}

  // abstract initWorker(workerUrl: string | URL): WorkerType
  constructor(workerName = '') {
    this.workerName = workerName
  }

  // browser env default impl
  /**
   *
   * @param worldLocalEnv
   * @param worker allow passing external worker to workaround issue with some bundlers
   * @returns
   */
  // eslint-disable-next-line no-undef
  init(worldLocalEnv: WorldLocals, workerExternalBuilder?: () => Worker) {
    const worker =
      workerExternalBuilder?.() ??
      // eslint-disable-next-line no-undef
      new Worker(new URL('./world_compute_worker', import.meta.url), { type: 'module', name: this.workerName })
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
    pendingInit.then(() => console.log(`worker ${this.workerName} is ready`))
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
        console.warn(
          `missing message resolver ${timestamp} for worker ${this.workerName}`,
        )
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
      const timestamp = performance.now()
      // task?.onProcessingStart()
      const content = task.toStub()
      this.resolvers[timestamp] = task.resolve
      this.worker.postMessage({ timestamp, content })
      return true
    }
    return false
  }
}
