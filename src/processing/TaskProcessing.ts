import workerpool from 'workerpool'

import { WorldEnv } from '../index'
import { parseThreeStub } from '../utils/convert'

const toStubs = (res: any) =>
  res instanceof Array ? res.map(item => item.toStub?.() || item) : res.toStub?.() || res

const parseArgs = (...rawArgs: any) => {
  const args = rawArgs.map((rawArg: any) => {
    const arg = rawArg instanceof Array
      ? rawArg.map(item => parseThreeStub(item))
      : parseThreeStub(rawArg)
    return arg
  })
  return args
}

export enum ProcessingState {
  Pending = 'pending',
  Waiting = 'waiting',
  Postponed = 'postponed',
  Suspended = 'suspended',
  Done = 'done',
}

// eslint-disable-next-line no-use-before-define
type ProcessingTasksIndex = Record<string, new (...args: any) => ProcessingTask>

/**
 * Any object extending this class will support
 * - delegation to perform object's processing in worker
 * - replication to replicate original object inside worker
 * - reconcilitation to merge data back from worker into original object
 */
export class ProcessingTask {
  static registeredObjects: ProcessingTasksIndex = {}
  static workerPool: any
  processingState: ProcessingState = ProcessingState.Waiting
  processingParams: any = {}
  result: any
  // pendingTask: any

  // static instances: ProcessingTask[] = []

  // constructor(){
  //   ProcessingTask.instances.push(this)
  // }

  static initWorkerPool(
    workerUrl?: string,
    workerCount?: number,
    workerType?: any,
  ) {
    const { url, count, type } = WorldEnv.current.workerPool
    workerUrl = workerUrl || url
    if (workerUrl && workerUrl.length > 0) {
      workerCount = workerCount || count
      workerType = workerType || type
      // eslint-disable-next-line no-undef
      const workerOpts: WorkerOptions = {}
      if (workerType) {
        // By default, Vite uses a module worker in dev mode, which can cause your application to fail.
        // Therefore, we need to use a module worker in dev mode and a classic worker in prod mode.
        workerOpts.type = workerType
      }
      this.workerPool = workerpool.pool(workerUrl, {
        maxWorkers: workerCount,
        workerOpts,
      })
    }
  }

  /**
   * replicate original object in worker to process it
   * @param objectType
   * @param callArgs
   * @param processingParams
   * @returns
   */
  static async replicate(...input: any) {
    const [targetObjName, targetRawArgs, processingParams] = input
    const targetArgs = parseArgs(...targetRawArgs)
    const TargetObj = ProcessingTask.registeredObjects[targetObjName]
    if (TargetObj) {
      const targetObj = new TargetObj(...targetArgs)
      const res = await targetObj.process(processingParams)
      const stubs = toStubs(res)
      return stubs // targetObj.toStub()
    } else {
      console.warn(
        `cannot replicate unregistered object ${targetObjName}, should be registered first`,
      )
    }
  }

  get awaitingProcessing() {
    return (
      this.processingState !== ProcessingState.Done &&
      this.processingState !== ProcessingState.Pending
    )
  }

  /**
   * pass object's creation parameters to worker for replication
   * @param processingParams
   * @param processingUnit
   */
  async delegate(
    processingParams = this.processingParams,
    processingUnit = ProcessingTask.workerPool,
  ) {
    if (this.processingState === ProcessingState.Done) return undefined
    else {
      const targetObj = this.constructor.name
      const targetArgs = this.inputs
      this.processingState = ProcessingState.Pending
      const pendingTask = processingUnit
        .exec('replicate', [targetObj, targetArgs, processingParams])
        .catch((e: any) => {
          console.log(e)
          this.processingState = ProcessingState.Postponed

          // throw e
        })
      const stubs = await pendingTask
      const output = stubs ? this.reconcile(stubs) : null
      this.result = output
      this.processingState =
        this.processingState === ProcessingState.Pending
          ? ProcessingState.Done
          : this.processingState
      // this.pendingTask = null
      return output // this.reconcile(stubs)
    }
  }

  // cancelPendingTask() {
  //   if (!this.pendingTask) {
  //     console.warn(`no pending task running`)
  //     return false
  //   } else {
  //     this.pendingTask?.cancel()
  //     this.pendingTask = null
  //     return true
  //   }
  // }

  /**
   * reconcile data coming from worker into original object
   */
  reconcile(stubs: any) {
    return stubs
  }

  /**
   * parameters used for object's creation required for object's replication
   */
  get inputs() {
    return [] as any[]
  }

  /**
   * transferrable data after object was processed inside worker
   */
  // get stubs() {

  // }

  /**
   * This will be called :
   * - either from main thread
   * - or worker if processing was delegated and after original object's replication
   */
  process(processingParams: any): any {
    console.log(processingParams)
  }

  // toStub(): any {
  //   const { stubs } = this
  //   stubs instanceof Array
  //     ? stubs.map(item => item.toStub())
  //     : outputs.toStub?.() || outputs
  // }
}
