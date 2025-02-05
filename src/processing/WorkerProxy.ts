import { TaskId, GenericTask } from './TaskProcessing'

/**
 * Interface to interact with worker
 * and proxying request to worker
 */
export abstract class WorkerProxy<WorkerType> {
  id
  worker: WorkerType
  resolvers: Record<TaskId, any> = {}

  abstract initWorker(workerUrl: string | URL): WorkerType

  constructor(workerUrl: string | URL, workerId = 0) {
    // eslint-disable-next-line no-undef
    this.worker = this.initWorker(workerUrl)
    this.id = workerId
  }

  handleWorkerReply = (workerReply: any) => {
    // console.log(workerReply)
    const reply = workerReply.data
    if (reply.id !== undefined) {
      const taskResolver = this.resolvers[reply.id]
      taskResolver(reply.data)
      delete this.resolvers[reply.id]
    }
  }

  get isBusy() {
    return Object.keys(this.resolvers).length > 0
  }

  get pendingRequests() {
    return Object.keys(this.resolvers)
  }

  async proxyRequest(task: GenericTask) {
    if (!this.isBusy) {
      const { taskId } = task
      // const request = {
      //     id: this.processedCount++,
      //     task
      // }
      // task?.onProcessingStart()
      // console.log(`send task: ${taskId}`)
      // console.log(this.worker)
      const transferredData = task.toStub()
      // console.log(transferredData)
      ;(this.worker as any).postMessage(transferredData)
      // const pendingReply = new Promise<any>(resolve => (this.resolvers[taskId] = resolve))
      this.resolvers[taskId] = task.resolve
      // const reply = await task.promise
      // return reply.data
      return true
    }
    return false
  }
}
/**
 * Default implementation running in browser env
 */
// eslint-disable-next-line no-undef
export class BrowserWorkerProxy extends WorkerProxy<Worker> {
  // eslint-disable-next-line no-undef
  initWorker(workerUrl: string | URL): Worker {
    // const handleWorkerReply = (workerReply: any) => {
    //   const replyData = workerReply.data
    //   if (replyData.id !== undefined) {
    //     const taskResolver = this.resolvers[replyData.id]
    //     taskResolver(replyData.data)
    //     delete this.resolvers[replyData.id]
    //   }
    // }

    // eslint-disable-next-line no-undef
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.onmessage = this.handleWorkerReply
    worker.onerror = error => {
      console.error('WorldComputeProxy worker error', error)
    }
    worker.onmessageerror = error => {
      console.error('WorldComputeProxy worker messageerror', error)
    }
    return worker
  }
}
