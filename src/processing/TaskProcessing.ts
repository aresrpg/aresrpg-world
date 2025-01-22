import { WorkerPool } from '../index'
import { parseThreeStub } from '../utils/convert'

export const toTaskOutputStubs = (res: any) =>
  res instanceof Array
    ? res.map(item => item.toStub?.() || item)
    : res.toStub?.() || res

export const parseTaskInputStubs = (...rawArgs: any) => {
  const args = rawArgs.map((rawArg: any) => {
    const arg =
      rawArg instanceof Array
        ? rawArg.map(item => parseThreeStub(item))
        : parseThreeStub(rawArg)
    return arg
  })
  return args
}

export enum ProcessingState {
  None = 'none',
  Scheduled = 'scheduled',
  Waiting = 'waiting',
  Pending = 'pending',
  // Postponed = 'postponed',
  Suspended = 'suspended',
  Canceled = 'canceled',
  Done = 'done',
}

// eslint-disable-next-line no-use-before-define
type ProcessingTaskHandlerId = string
export enum ProcessingContext {
  None,
  Worker,
}
export type TaskId = string | number
export type ProcessingTaskStub<ProcessingInput, ProcessingParams> = {
  taskId: TaskId
  processingInput: ProcessingInput
  processingParams: ProcessingParams
  handlerId: ProcessingTaskHandlerId
}
export type ProcessingTaskHandler<
  ProcessingInput,
  ProcessingParams,
  ProcessingOutput,
> = (
  taskStub: ProcessingTaskStub<ProcessingInput, ProcessingParams>,
  context?: ProcessingContext,
) => Promise<ProcessingOutput>
type ProcessingTasksHandlers = Record<
  ProcessingTaskHandlerId,
  ProcessingTaskHandler<any, any, any>
>

/**
 * Tasks can be processed locally on main thread, worker thread
 * or even remotely on server
 */
export class ProcessingTask<
  ProcessingInput,
  ProcessingParams,
  ProcessingOutput,
> {
  static taskHandlers: ProcessingTasksHandlers = {}
  static globalTasksCount = 0
  processingInput: ProcessingInput = [] as ProcessingInput
  processingParams: ProcessingParams = {} as ProcessingParams
  handlerId: ProcessingTaskHandlerId = ''
  processingState: ProcessingState = ProcessingState.Waiting
  taskId: TaskId
  order = 0
  promise!: Promise<ProcessingOutput>
  resolve: any
  // result: any
  // deferredPromise
  // resolveDeferredPromise: any
  scheduled = false

  static async handleTask(
    taskStub: ProcessingTaskStub<any, any>,
    context?: ProcessingContext,
  ) {
    // const [delegatedTask, processingArgs, processingParams] = taskStub
    const { handlerId } = taskStub
    // const args = parseArgs(...processingArgs)
    const taskHandler = ProcessingTask.taskHandlers[handlerId]
    if (taskHandler) {
      // const task = new Task(...args)
      const taskRes = await taskHandler(taskStub, context)
      // const res = await task.preProcess(processingArgs, processingParams)
      // const stubs = toStubs(res)
      return taskRes // targetObj.toStub()
    } else {
      console.warn(`no task handler found for ${handlerId}`)
    }
  }

  constructor(taskId?: TaskId) {
    ProcessingTask.globalTasksCount++
    this.taskId = taskId || ProcessingTask.globalTasksCount
    // const deferredPromise = new Promise(resolve => {
    //   this.resolveDeferredPromise = resolve
    // })
    // this.deferredPromise = deferredPromise
  }

  get awaitingProcessing() {
    return (
      this.processingState !== ProcessingState.Done &&
      this.processingState !== ProcessingState.Pending
    )
  }

  // getDeferredPromise = () => {
  //   this.deferredPromise = this.deferredPromise || new Promise(resolve => {
  //     this.resolveDeferredPromise = resolve
  //   })
  //   return this.deferredPromise
  // }

  /**
   * run task on current thread
   */
  process() {
    return ProcessingTask.handleTask(this)
  }

  /**
   * run task on worker
   * pass inputs and parameters to worker
   * @param processingParams
   * @param processingUnit
   */
  async delegate(processingUnit = WorkerPool.default) {
    if (!this.promise)
      // if (this.processingState !== ProcessingState.Done) {
      // this.processingState = ProcessingState.Pending
      // const taskStub = this.toStub()
      this.promise = new Promise<ProcessingOutput>(
        resolve => (this.resolve = resolve),
      )
    processingUnit.enqueueTasks(this)
    //   .exec('delegateTask', transferredData)
    //   .catch((e: any) => {
    //     console.log(e)
    //     this.processingState = ProcessingState.Postponed

    //     // throw e
    //   })
    const taskOutput = await this.promise
    this.processingState =
      this.processingState === ProcessingState.Pending
        ? ProcessingState.Done
        : this.processingState
    const taskData: ProcessingOutput = this.postProcess(taskOutput)
    this.onTaskCompleted(taskData)
    // this.resolveDeferredPromise(taskData)
    // this.pendingTask = null
    // this.onTaskProcessed(taskRes)
    // const taskRes = stubs ? this.reconcile(stubs) : null
    // this.result = taskRes
    // return taskRes // this.reconcile(stubs)
    return taskData
    // }
  }

  /**
   * defer task processing
   * @param delay
   * @param onDeferredStart
   * @returns
   */
  defer(delay = 0) {
    if (this.processingState === ProcessingState.None) {
      this.processingState = ProcessingState.Scheduled
      setTimeout(this.delegate, delay)
    }
    return null
  }

  /**
   * run task remotely on server
   */
  request() {}

  cancel() {
    // this will instruct worker pool to reject task
    this.processingState = ProcessingState.Canceled
  }

  suspend() {
    // this will instruct worker pool to postpone task processing
    this.processingState = ProcessingState.Suspended
  }

  isActive() {
    return this.processingState === ProcessingState.Waiting
  }

  isInactive() {
    return (
      this.processingState === ProcessingState.Canceled ||
      this.processingState === ProcessingState.Suspended ||
      this.processingState === ProcessingState.Done
    )
  }

  /**
   * will be called on receiver side before processing
   * to parse input data
   */
  // preProcess(processingArgs: any, processingParams: any) {

  // }

  /**
   * will be called on sender side after processing
   * to parse output data
   */
  postProcess(rawOutputData: any): any {
    return rawOutputData
  }

  onRejected = () => {
    console.log(`skipped task processing`)
  }

  onStarted = () => {}

  onDone = () => {}

  /**
   * additional callback where post process actions can be performed
   * upon task data reception
   * @param rawData
   * @returns
   */
  onTaskCompleted(taskOutput: ProcessingOutput) {
    // console.log(taskOutput)
    return taskOutput
  }

  toStub() {
    const { processingInput, processingParams, handlerId, taskId } = this
    const processingTaskStub: ProcessingTaskStub<
      ProcessingInput,
      ProcessingParams
    > = {
      processingInput,
      processingParams,
      handlerId,
      taskId,
    }
    return processingTaskStub
  }
}

export type GenericTask = ProcessingTask<any, any, any>

// export class ProcessingTaskHandler {
//   handleTask(task: ProcessingTask<any, any, any>) {

//   }
// }
