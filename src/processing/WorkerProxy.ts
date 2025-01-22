import { WorldEnv } from '../index'

import {
  GenericTask,
  ProcessingContext,
  ProcessingState,
  ProcessingTask,
  TaskId,
} from './TaskProcessing'

/**
 * Handling request on worker side
 */
export const WorkerSideInit = () => {
  // eslint-disable-next-line no-undef
  addEventListener('error', e => {
    console.error(e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.message })
  })

  // eslint-disable-next-line no-undef
  addEventListener('unhandledrejection', e => {
    console.error('Worker script unhandled rejection:', e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.reason })
  })

  // eslint-disable-next-line no-undef
  addEventListener('message', async ({ data: request }) => {
    // const { id, task } = data
    const reply = {
      id: request.taskId,
      data: null,
    }
    const taskHandler = ProcessingTask.taskHandlers[request.handlerId]
    if (taskHandler) {
      const taskOutput = await taskHandler(request, ProcessingContext.Worker)
      reply.data = taskOutput
    }
    // eslint-disable-next-line no-undef
    postMessage(reply)
  })
}

/**
 * Proxying request to worker
 */
export class WorkerProxy {
  id
  worker
  resolvers: Record<TaskId, any> = {}

  constructor(workerUrl: string, workerId = 0) {
    // eslint-disable-next-line no-undef
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.id !== undefined) {
        const taskResolver = this.resolvers[data.id]
        taskResolver(data.data)
        delete this.resolvers[data.id]
      }
    }

    worker.onerror = error => {
      console.error('WorldComputeProxy worker error', error)
    }

    worker.onmessageerror = error => {
      console.error('WorldComputeProxy worker messageerror', error)
    }
    this.worker = worker
    this.id = workerId
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
      this.worker.postMessage(task.toStub())
      // const pendingReply = new Promise<any>(resolve => (this.resolvers[taskId] = resolve))
      this.resolvers[taskId] = task.resolve
      // const reply = await task.promise
      // return reply.data
      return true
    }
    return false
  }
}

const createDefaultWorkerPool = () => {
  const { url, count } = WorldEnv.current.workerPool
  console.log(`create default workerpool`)
  return new WorkerPool(url, count)
}

/**
 * This will handle tasks enqueueing, dispatching to multiple workers
 */
export class WorkerPool {
  // eslint-disable-next-line no-use-before-define
  static defaultWorkerPool: WorkerPool

  static get default() {
    this.defaultWorkerPool = this.defaultWorkerPool || createDefaultWorkerPool()
    return this.defaultWorkerPool
  }

  processingQueue: GenericTask[] = []
  suspended: GenericTask[] = []
  workerPool: WorkerProxy[] = []
  // pendingRequests = []
  processedCount = 0

  constructor(workerUrl: string, workerCount: number) {
    console.log(`create workerpool with count ${workerCount}`)
    for (let workerId = 0; workerId < workerCount; workerId++) {
      const worker = new WorkerProxy(workerUrl, workerId)
      this.workerPool.push(worker)
    }
  }

  get availableUnit() {
    // this.workerPool.find(worker=>worker.)
    return this.workerPool.find(workerUnit => !workerUnit.isBusy)
  }

  get nextTask() {
    return this.processingQueue[0]
  }

  get pendingTasks() {
    const pendingTaskIds: string[] = []
    this.workerPool.forEach(unit =>
      pendingTaskIds.push(...unit.pendingRequests),
    )
    return pendingTaskIds
  }

  /**
   * Should be called any time task priority changes
   * or new task is added to the queue
   */
  reorderTasks() {
    this.processingQueue.sort((t1, t2) => t1.order - t2.order)
  }

  enqueueTasks(...tasks: GenericTask[]) {
    tasks.forEach(task => {
      task.processingState = ProcessingState.Waiting
      this.processingQueue.push(task)
    })
    this.reorderTasks()
    this.processQueue()
  }

  onRejectedTask = (task: GenericTask) => {
    console.log(`rejected task with processing state: ${task.processingState}`)
    task.onRejected()
  }

  /**
   * Dispatch items from the queue as much as possible to available workers
   */
  processQueue() {
    while (this.availableUnit && this.processingQueue.length > 0) {
      const nextTask = this.processingQueue.shift()
      if (nextTask) {
        if (nextTask.isActive()) {
          const pending = this.availableUnit?.proxyRequest(nextTask)
          if (!pending) {
            // this should not happen
            console.warn(
              `unexpected: worker no longer available, reenqeue task`,
            )
            this.processingQueue.push(nextTask)
          } else {
            nextTask.processingState = ProcessingState.Pending
            // after task has finished
            nextTask.promise.then(() => {
              this.processQueue()
            })
            // once finished check for remaining tasks in queue
          }
        } else {
          // canceled task, move on to next one
          nextTask.onRejected()
        }
      } else {
        // this should not happen
        console.warn(`unexpected: no task left in queue, cancel operation`)
      }
    }
  }
}
