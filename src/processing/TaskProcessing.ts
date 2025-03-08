import { parseThreeStub } from '../utils/patch_chunk.js'

import { WorkerPool } from './WorkerPool.js'

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
  // from here is in processing queue
  Waiting = 'waiting',
  Pending = 'pending',
  // from here is inactive
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

//
export type ProcessingTaskHandler<
  ProcessingInput,
  ProcessingParams,
  ProcessingOutput,
> = (
  taskStub: ProcessingTaskStub<ProcessingInput, ProcessingParams>,
  context?: ProcessingContext,
) => Promise<ProcessingOutput> | ProcessingOutput
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
  processingState: ProcessingState = ProcessingState.None
  taskId: TaskId
  rank = 0
  promise!: Promise<ProcessingOutput>
  resolve: any
  reject: any
  // result: any
  // deferredPromise
  // resolveDeferredPromise: any
  scheduled = false

  static handleTask<T, U>(
    taskStub: ProcessingTaskStub<T, U> | ProcessingTask<T, any, U>,
    context?: ProcessingContext,
  ) {
    // const [delegatedTask, processingArgs, processingParams] = taskStub
    const { handlerId } = taskStub
    // const args = parseArgs(...processingArgs)
    const taskHandler = ProcessingTask.taskHandlers[
      handlerId
    ] as ProcessingTaskHandler<T, any, U>
    if (taskHandler) {
      // const task = new Task(...args)
      const taskRes = taskHandler(taskStub, context)
      // const res = await task.preProcess(processingArgs, processingParams)
      // const stubs = toStubs(res)
      return taskRes // targetObj.toStub()
    } else {
      console.warn(`no task handler found for ${handlerId}`)
    }
    return null
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

  getPromise() {
    this.promise =
      this.promise ||
      new Promise<ProcessingOutput>((resolve, reject) => {
        this.resolve = resolve
        this.reject = reject
      }).catch(this.onRejected)
    return this.promise
  }

  // getDeferredPromise = () => {
  //   this.deferredPromise = this.deferredPromise || new Promise(resolve => {
  //     this.resolveDeferredPromise = resolve
  //   })
  //   return this.deferredPromise
  // }

  /**
   * Depending on task being run, result will be either sync or async
   */
  process() {
    const res = ProcessingTask.handleTask<ProcessingInput, ProcessingOutput>(
      this,
    ) as ProcessingOutput
    this.onCompleted(res)
    return res
  }

  async asyncProcess() {
    this.onStarted()
    const res = (await ProcessingTask.handleTask<
      ProcessingInput,
      ProcessingOutput
    >(this)) as ProcessingOutput
    return this.onCompleted(res)
  }

  /**
   * This will delegate task processing to specific processing environment
   * like (workerpool, remote, ..):
   * @param targetEnv target processing environment
   * @returns
   */
  delegate = async (targetEnv: WorkerPool) => {
    // prevents task from being enqueued several times
    // if (this.isNotEnqueued()) {
    // if (this.processingState !== ProcessingState.Done) {
    // this.processingState = ProcessingState.Pending
    // const taskStub = this.toStub()
    const pendingPromise = this.getPromise()
    targetEnv.enqueueTasks(this)
    //   .exec('delegateTask', transferredData)
    //   .catch((e: any) => {
    //     console.log(e)
    //     this.processingState = ProcessingState.Postponed

    //     // throw e
    //   })
    const taskOutput = await pendingPromise
    this.processingState =
      this.processingState === ProcessingState.Pending
        ? ProcessingState.Done
        : this.processingState
    const taskData: ProcessingOutput = this.postProcess(taskOutput)
    return this.onCompleted(taskData)
    // this.resolveDeferredPromise(taskData)
    // this.pendingTask = null
    // this.onTaskProcessed(taskRes)
    // const taskRes = stubs ? this.reconcile(stubs) : null
    // this.result = taskRes
    // return taskRes // this.reconcile(stubs)
    // return taskData
    // }
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
      // TODO: this can't work as delegate needs a worker
      setTimeout(this.delegate, delay)
      return this.getPromise()
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
    // this.resolve?.(null)
    this.reject?.('task cancelled')
  }

  suspend() {
    // this will instruct worker pool to postpone task processing
    this.processingState = ProcessingState.Suspended
  }

  isNotEnqueued = () =>
    this.processingState === ProcessingState.None ||
    this.processingState === ProcessingState.Scheduled

  isWaiting = () => this.processingState === ProcessingState.Waiting
  isPending = () => this.processingState === ProcessingState.Pending
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

  onStarted = () => {}

  /**
   * additional callback where post process actions can be performed
   * upon task data reception
   * @param rawData
   * @returns
   */
  onCompleted(taskOutput: ProcessingOutput): any {
    // console.log(taskOutput)
    return taskOutput
  }

  onRejected = (error: string) => {
    console.log(error)
    return null
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
export type GenericTaskStub = ProcessingTaskStub<any, any>

// export class ProcessingTaskHandler {
//   handleTask(task: ProcessingTask<any, any, any>) {

//   }
// }
