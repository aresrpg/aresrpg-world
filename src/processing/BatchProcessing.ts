import { ProcessingState, ProcessingTask } from "./TaskProcessing";

export class BatchProcess {
    static batches: BatchProcess[] = []
    static batchId = 0
    tasksQueue: ProcessingTask[] = []
    count = 0
    processed = 0
    status = ProcessingState.Waiting
    batchId

    constructor(batch: ProcessingTask[]) {
        this.tasksQueue = batch
        this.count = batch.length
        this.batchId = BatchProcess.batchId++
    }

    get isDone() {
        return this.tasksQueue.length === 0 && this.processed === this.count //&& this.cancelled === false
    }

    get isInterrupted() {
        return this.status === ProcessingState.Interrupted && this.tasksQueue.length > 0
    }

    get isTerminated() {
        return this.isDone || this.status === ProcessingState.Interrupted
    }

    interrupt() {
        this.status = ProcessingState.Interrupted
    }

    async run(onTaskCompleted: any) {
        const startTime = Date.now()
        const pendingBatch = new Promise((resolve, reject) => {
            while (ProcessingTask.workerPool.tasks.length === 0 && this.tasksQueue.length > 0) {
                this.printLog(`scaling up`)
                this.processNextTask(onTaskCompleted, resolve)
            }
        })
        await pendingBatch
        const elapsedTime = Date.now() - startTime
        const log = this.isDone ? `completed in ${elapsedTime}ms, ${this.processed} items processed ` :
            `terminated prematurely after ${elapsedTime}ms, ${this.processed} processed, ${this.tasksQueue.length} remaining`
        this.printLog(log)
        BatchProcess.cleanTerminated()
    }

    processNextTask(onTaskCompleted: any, onBatchTerminated: any) {
        const nextTask = this.tasksQueue.pop()
        if (nextTask) {
            nextTask.delegate().then(res => {
                this.processed++
                // console.log(`processed: ${this.processed}, remaining: ${remaining}`)
                onTaskCompleted(res)
                this.isTerminated ? onBatchTerminated() : this.processNextTask(onTaskCompleted, onBatchTerminated)
            })
        }
        // else {
        //     this.onBatchCompleted()
        // }
    }

    printLog(log: string) {
        const logPrefix = `Batch#${this.batchId} `
        console.log(logPrefix + log)
    }

    static cleanTerminated() {
        this.batches = this.batches.filter(item => !item.isTerminated)
    }
}