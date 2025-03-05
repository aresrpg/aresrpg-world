import { WorldEnv } from '../config/WorldEnv.js'

import { WorkerProxy } from './WorkerProxy.js'
import { GenericTask, ProcessingState } from './TaskProcessing.js'
// export interface WorkerPoolInterface {
//   purgeQueue(whiteList: (task: GenericTask) => boolean,
//     blackList: (task: GenericTask) => boolean): void

//   sortQueue(taskSorter: any): void

// }

/**
 * This will manage pool of worker in web or node environment,
 *  tasks enqueueing, dispatching
 */
export class WorkerPool {
  processingQueue: GenericTask[] = []
  // suspended: GenericTask[] = []
  workerPool: WorkerProxy[] = []
  // pendingRequests = []
  processedCount = 0
  ready = false

  async initPoolEnv(poolSize: number, worldEnv: WorldEnv) {
    console.log(`create worker pool size: ${poolSize} `)
    const pendingInits = []
    for (let workerId = 0; workerId < poolSize; workerId++) {
      const workerProxy = new WorkerProxy(workerId)
      const pendingInit = workerProxy.init(worldEnv)
      pendingInits.push(pendingInit)
      this.workerPool.push(workerProxy)
    }
    await Promise.all(pendingInits).then(() => {
      this.ready = true
      this.processQueue()
    })
  }

  get availableUnit() {
    // this.workerPool.find(worker=>worker.)
    return this.workerPool.find(workerUnit => workerUnit.isReady)
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
    this.processingQueue.sort((t1, t2) => t1.rank - t2.rank)
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
    // postpone task processing until workerpool is ready
    while (
      this.ready &&
      this.availableUnit &&
      this.processingQueue.length > 0
    ) {
      const nextTask = this.processingQueue.shift()
      if (nextTask) {
        if (nextTask.isWaiting()) {
          const pending = this.availableUnit.forwardTask(nextTask)
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
