import { applyWorldEnv, WorldEnvSettings } from '../config/WorldEnv.js'

import {
  TaskId,
  GenericTask,
  GenericTaskStub,
  ProcessingContext,
  ProcessingTask,
} from './TaskProcessing.js'

export type MessageData<T> = {
  timestamp: number
  content: T
}

/**
 * Interface to interact and proxy requests to worker
 */
export class WorkerProxy {
  id
  worker: any // will be available when worker is ready
  resolvers: Record<TaskId, any> = {}

  // abstract initWorker(workerUrl: string | URL): WorkerType
  constructor(workerId = 0) {
    this.id = workerId
  }

  // browser env default impl
  init() {
    const workerUrl = new URL('./world_compute_worker', import.meta.url)
    // eslint-disable-next-line no-undef
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.onmessage = workerReply => this.handleWorkerReply(workerReply.data)
    worker.onerror = error => {
      console.error('WorldComputeProxy worker error', error)
    }
    worker.onmessageerror = error => {
      console.error('WorldComputeProxy worker messageerror', error)
    }
    this.worker = worker
    return worker
  }

  handleWorkerReply = (reply: MessageData<any>) => {
    const { timestamp, content } = reply
    if (timestamp !== undefined) {
      const msgResolver = this.resolvers[timestamp]
      msgResolver(content.data)
      delete this.resolvers[timestamp]
    }
  }

  get isReady() {
    const isBusy = () => Object.keys(this.resolvers).length > 0
    return this.worker && !isBusy()
  }

  get pendingRequests() {
    return Object.keys(this.resolvers)
  }

  async forwardEnv(worldEnv: WorldEnvSettings) {
    if (this.worker) {
      const timestamp = Date.now()
      const pendingReply = new Promise<any>(
        resolve => (this.resolvers[timestamp] = resolve),
      )
      this.worker.postMessage({ timestamp, content: worldEnv })
      await pendingReply.then(() => console.log(`worker is ready`))
      return true
    }
    console.warn(`unexpected worker not running`)
    return false
  }

  async forwardTask(task: GenericTask) {
    if (this.worker && this.isReady) {
      const timestamp = Date.now()
      // task?.onProcessingStart()
      const content = task.toStub()
      this.worker.postMessage({ timestamp, content })
      this.resolvers[timestamp] = task.resolve
      return true
    }
    return false
  }
}

/**
 * Worker side handlers
 */

const onForwardedEnv = (envSettings: WorldEnvSettings) => {
  // this will apply settings for worker's environment
  applyWorldEnv(envSettings)
  const done = true
  return { done }
}

const onForwardedTask = async (taskStub: GenericTaskStub) => {
  const reply = {
    id: taskStub.taskId,
    data: null,
  }
  const { taskHandlers } = ProcessingTask
  const taskHandler = taskHandlers[taskStub.handlerId]
  if (taskHandler) {
    const taskOutput = await taskHandler(taskStub, ProcessingContext.Worker)
    reply.data = taskOutput
  }
  return reply
}

export const workerRequestHandler = async (
  request: MessageData<WorldEnvSettings | GenericTaskStub>,
) => {
  const { timestamp, content } = request
  // console.log(`[worker] received task ${eventData.taskId} `)
  // const { id, task } = data
  const res = (content as GenericTaskStub).taskId
    ? await onForwardedTask(content as GenericTaskStub)
    : await onForwardedEnv(content as WorldEnvSettings)
  // eslint-disable-next-line no-undef
  const workerReply = { timestamp, content: res }
  return workerReply
}
