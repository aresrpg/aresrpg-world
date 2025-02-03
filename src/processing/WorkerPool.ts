import { WorldEnv } from '../index'
import {
  GenericTask,
  ProcessingState,
} from './TaskProcessing'

const createDefaultWorkerPool = () => {
  const { url, count } = WorldEnv.current.workerPool
  console.log(`create default workerpool, pool size: ${count}`)
  return url.length > 0 ? new WorkerPool(url, count) : null
}

/**
 * This will handle tasks enqueueing, dispatching to multiple workers
 */
export class WorkerPool<Worker> {
  // eslint-disable-next-line no-use-before-define
  static defaultWorkerPool: WorkerPool<any>

  static get default() {
    this.defaultWorkerPool = this.defaultWorkerPool || createDefaultWorkerPool()
    return this.defaultWorkerPool
  }

  processingQueue: GenericTask[] = []
  suspended: GenericTask[] = []
  workerPool: WorkerProxy<Worker>[] = []
  // pendingRequests = []
  processedCount = 0

  init(workerFactory: (workerId?: number) => WorkerProxy<Worker>, workerCount: number) {
    console.log(`create workerpool of pool size: ${workerCount}`)
    for (let workerId = 0; workerId < workerCount; workerId++) {
      // const worker = new WorkerProxy(workerUrl, workerId)
      const worker = workerFactory(workerId)
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
        if (nextTask.isWaiting()) {
          const pending = this.availableUnit?.proxyRequest(nextTask)
          if (!pending) {
            // this should not happen
            console.warn(
              `unexpected: worker no longer available, reschedule task`,
            )
            this.processingQueue.push(nextTask)
          } else {
            nextTask.processingState = ProcessingState.Pending
            nextTask.onStarted()
            nextTask.getPromise().then(() => {
              // once finished check for remaining tasks in queue
              this.processQueue()
            })
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
