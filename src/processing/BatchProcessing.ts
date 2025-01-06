import { ProcessingState, ProcessingTask } from './TaskProcessing'

export class BatchProcess<T extends ProcessingTask> {
  // eslint-disable-next-line no-use-before-define
  static batchQueue: BatchProcess<ProcessingTask>[] = []
  static batchCount = 0
  static queuePointer = 0
  processingQueue: T[] = []
  count = 0
  processed = 0
  status = ProcessingState.Waiting
  batchId
  onTaskCompleted = (taskRes: any) => taskRes
  onBatchSuspended: any

  constructor(batch: T[], onTaskCompleted?: any) {
    this.processingQueue = batch
    this.count = batch.length
    this.batchId = BatchProcess.batchCount++
    this.onTaskCompleted = onTaskCompleted || this.onTaskCompleted
    BatchProcess.batchQueue.push(this)
  }

  static async processNextBatch() {
    const { nextBatch } = this
    if (nextBatch && !this.isBusy) {
      nextBatch.status = ProcessingState.Pending
      await nextBatch.run()
      nextBatch.status = nextBatch.isDone
        ? ProcessingState.Done
        : nextBatch.status
      this.processNextBatch()
    }
  }

  static get isBusy() {
    return !!this.batchQueue.find(
      batch =>
        batch.status === ProcessingState.Pending ||
        batch.pendingTasks.length > 0,
    )
  }

  static get nextBatch() {
    return this.batchQueue.find(
      batch => batch.status === ProcessingState.Waiting,
    )
  }

  get isDone() {
    return !this.nextTask && this.pendingTasks.length === 0 // && this.processed === this.count //&& this.cancelled === false
  }

  get isTerminated() {
    return this.pendingTasks.length === 0 // this.isInterrupted
  }

  get nextTask() {
    return this.processingQueue.find(
      task => task.processingState === ProcessingState.Waiting,
    ) // this.processingQueue.pop()
  }

  get leftTasks() {
    return this.processingQueue.filter(
      task => task.processingState === ProcessingState.Waiting,
    )
  }

  get pendingTasks() {
    return this.processingQueue.filter(
      task => task.processingState === ProcessingState.Pending,
    )
  }

  suspend(): Promise<any> | undefined {
    if (this.status === ProcessingState.Pending) {
      // this.status = ProcessingState.Suspended
      const suspending = new Promise(resolve => {
        this.printLog(`suspending execution`)
        this.status = ProcessingState.Suspended
        this.onBatchSuspended = resolve
      })
      return suspending
    }
    return undefined
  }

  resume() {
    if (this.status === ProcessingState.Suspended) {
      this.printLog(`resuming execution`)
      this.status = ProcessingState.Pending
    }
  }

  async run(onTaskCompleted = this.onTaskCompleted) {
    const startTime = Date.now()
    const pendingBatch = new Promise(resolve => {
      while (
        ProcessingTask.workerPool.tasks.length === 0 &&
        this.leftTasks.length > 0
      )
        this.processNextTask(onTaskCompleted, resolve)
    })
    await pendingBatch
    // this.status = this.isDone ? ProcessingState.Done : ProcessingState.Interrupted
    const elapsedTime = Date.now() - startTime
    const log_end =
      this.leftTasks.length > 0
        ? `, ${this.leftTasks.length} tasks left in the queue`
        : ``
    const log = this.isDone
      ? `${this.processed} tasks processed in ${elapsedTime} ms `
      : `was suspended after ${this.processed} tasks processed in ${elapsedTime}ms` +
        log_end
    this.printLog(log)
    // BatchProcess.processNextBatch()
    // BatchProcess.cleanTerminated()
  }

  processNextTask(onTaskCompleted: any, onBatchTerminated: any) {
    const { nextTask } = this
    if (nextTask) {
      const pendingTask = nextTask.delegate()
      // const taskRes = await pendingTask
      pendingTask.then(taskRes => {
        this.processed++
        // this.printLog(`processed: ${this.processed}, left: ${this.leftTasks.length}`)
        onTaskCompleted(taskRes)
        if (this.isTerminated) {
          this.status === ProcessingState.Suspended
            ? onBatchTerminated()
            : this.onBatchSuspended?.()
        } else if (this.status === ProcessingState.Pending)
          this.processNextTask(onTaskCompleted, onBatchTerminated)
      })
    }
  }

  printLog(log: string) {
    const logPrefix = `Batch_#${this.batchId} `
    console.log(logPrefix + log)
  }

  static cleanTerminated() {
    this.batchQueue = this.batchQueue.filter(item => !item.isTerminated)
  }
}
