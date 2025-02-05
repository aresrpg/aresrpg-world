import { WorkerProxy } from './WorkerProxy'
import { BrowserWorkerProxy, WorldEnv } from '../index'
// import { NodeWorkerProxy } from './NodeWorkerProxy'
import {
  GenericTask,
  ProcessingState,
} from './TaskProcessing'

const createDefaultWorkerPool = () => {
  const { url, count } = WorldEnv.current.workerPool
  console.log(`create default workerpool, pool size: ${count}`)
  const defaultWorkerPool = new WorkerPool()
  defaultWorkerPool.init(url, count)
}

// export interface WorkerPoolInterface {
//   purgeQueue(whiteList: (task: GenericTask) => boolean,
//     blackList: (task: GenericTask) => boolean): void

//   sortQueue(taskSorter: any): void

// }

/**
 * This will handle tasks enqueueing, dispatching to multiple workers
 */
export class WorkerPool<Worker> {//implements WorkerPoolInterface {
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

  init(workerUrl: string | URL, poolSize: number, workerProxyConstructor?: any) {// isNodeWorker = false) {
    if (workerUrl instanceof URL || workerUrl.length > 0) {
      console.log(`create workerpool, pool size: ${poolSize} `)
      for (let workerId = 0; workerId < poolSize; workerId++) {
        // Can't use that due to Vite complaining about Node specific imports
        // const worker = isNodeWorker ? new NodeWorkerProxy('', workerId) : new BrowserWorkerProxy('', workerId) //workerFactory(workerId)
        // Workaround: use externally provided worker initializer for Node or default to Browser
        const WorkerProxy = workerProxyConstructor || BrowserWorkerProxy
        const worker = new WorkerProxy(workerUrl, workerId)
        this.workerPool.push(worker)
      }
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
    console.log(`rejected task with processing state: ${task.processingState} `)
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

  // purgeQueue(whiteList: (task: GenericTask) => boolean,
  //   blackList: (task: GenericTask) => boolean) {
  // }
}
