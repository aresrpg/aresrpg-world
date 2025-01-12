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
  elapsedTime = 0
  totalTime = 0

  constructor(batch: T[]) {
    this.processingQueue = batch
    this.count = batch.length
    this.batchId = BatchProcess.batchCount++
  }

  static async enqueueBatch(batch: BatchProcess<any>) {
    this.batchQueue.push(batch)
    this.processNextBatch(batch)
  }

  static async processNextBatch(batch?: BatchProcess<any>) {
    const nextBatch = batch || this.nextBatch
    if (nextBatch && nextBatch.processingQueue.length > 0 && !this.isBusy) {
      // nextBatch.status = ProcessingState.Pending
      await nextBatch.start()
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

  static cleanTerminated() {
    this.batchQueue = this.batchQueue.filter(item => !item.isTerminated)
  }

  // once batch in the queue will be automatically processed by workers
  enqueue(onTaskCompleted?: any, onBatchCompleted?: any, onBatchSuspended?: any) {
    this.onTaskCompleted = onTaskCompleted || this.onTaskCompleted
    this.onBatchCompleted = onBatchCompleted || this.onBatchCompleted
    this.onBatchSuspended = onBatchSuspended || this.onBatchSuspended
    BatchProcess.enqueueBatch(this)
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

  get finishedTask() {
    return this.processingQueue.filter(task => task.processingState === ProcessingState.Done)
  }

  async start(onTaskCompleted = this.onTaskCompleted) {
    this.status = ProcessingState.Pending
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
    this.elapsedTime += Date.now() - startTime
    this.isDone ? this.onBatchCompleted() : this.onBatchSuspended()
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

  processNextTask(onTaskCompleted: any, onBatchTerminated: any) {
    const { nextTask } = this
    if (nextTask) {
      const pendingTask = nextTask.delegate()
      // const taskRes = await pendingTask
      pendingTask.then(taskRes => {
        this.processed++
        // this.printLog(`processed: ${this.processed}, left: ${this.leftTasks.length}`)
        onTaskCompleted(nextTask)
        if (this.isTerminated) {
          this.status === ProcessingState.Suspended
            ? this.onBatchSuspended?.() 
            : onBatchTerminated()
        } else if (this.status === ProcessingState.Pending)
          this.processNextTask(onTaskCompleted, onBatchTerminated)
      })
    }
  }

  printLog(log: string) {
    const logPrefix = `Batch_#${this.batchId} `
    console.log(logPrefix + log)
  }

  onTaskCompleted(taskRes: any) {
    return taskRes
  }

  onBatchCompleted() {
    this.printLog(`${this.processed} tasks processed in ${this.elapsedTime} ms `)
    BatchProcess.processNextBatch()
  }

  onBatchSuspended(val?: any) {
    let log = `was suspended after ${this.processed} tasks processed in ${this.elapsedTime}ms`
    log += this.leftTasks.length > 0 ?
      `, ${this.leftTasks.length} tasks left in the queue`
      : ``
    this.printLog(log)
    return val
  }

}
