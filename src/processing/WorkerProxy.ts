import { isBrowserEnv } from '../utils/misc_utils'

import { TaskId, GenericTask } from './TaskProcessing'

/**
 * Interface to interact and proxy requests to worker
 */
export class WorkerProxy {
  id
  worker: any
  resolvers: Record<TaskId, any> = {}

  // abstract initWorker(workerUrl: string | URL): WorkerType

  constructor(workerUrl: string | URL, workerId = 0) {
    if (isBrowserEnv()) {
      this.worker = this.initWorker(workerUrl)
    } else {
      this.initNodeWorker(workerUrl).then(worker => {
        console.log(`node worker is ready`)
        this.worker = worker
      })
    }
    this.id = workerId
  }

  // default implementation running in browser env
  initWorker(workerUrl: string | URL) {
    // eslint-disable-next-line no-undef
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.onmessage = workerReply => this.handleWorkerReply(workerReply.data)
    worker.onerror = error => {
      console.error('WorldComputeProxy worker error', error)
    }
    worker.onmessageerror = error => {
      console.error('WorldComputeProxy worker messageerror', error)
    }
    return worker
  }

  // adaptation for node environment
  async initNodeWorker(workerUrl: string | URL) {
    const { Worker } = await import('worker_threads')
    const nodeWorker = new Worker(workerUrl)
    nodeWorker.on('message', this.handleWorkerReply)
    return nodeWorker
  }

  handleWorkerReply = (reply: any) => {
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
      this.worker.postMessage(transferredData)
      // const pendingReply = new Promise<any>(resolve => (this.resolvers[taskId] = resolve))
      this.resolvers[taskId] = task.resolve
      // const reply = await task.promise
      // return reply.data
      return true
    }
    return false
  }
}
