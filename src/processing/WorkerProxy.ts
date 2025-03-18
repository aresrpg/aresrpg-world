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

  // browser env default impl
  /**
   *
   * @param worldLocalEnv
   * @param workerUrl workaround for vite not supporting built-in worker URL
   * @returns
   */
  init(worldLocalEnv: WorldLocals, workerUrl: string) {
    // eslint-disable-next-line no-undef
    const worker = new Worker(workerUrl, { type: 'module' })
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
    // pendingInit.then(() => console.log(`worker is ready`))
    return pendingInit
  }

  handleWorkerReply = (reply: MessageData<any>) => {
    const { timestamp, content } = reply
    if (timestamp !== undefined) {
      const msgResolver = this.resolvers[timestamp]
      msgResolver(content.data)
      delete this.resolvers[timestamp]
    } else {
      console.error(
        `[WorkerProxy]: no resolver found for timestamp: ${timestamp}`,
      )
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
      this.worker.postMessage({ timestamp, content })
      this.resolvers[timestamp] = task.resolve
      return true
    }
    return false
  }
}
