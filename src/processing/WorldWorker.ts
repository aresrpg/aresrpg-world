import { WorldEnvSettings, worldRootEnv } from "../config/WorldEnv";
import { GenericTaskStub, ProcessingTask, ProcessingContext } from "./TaskProcessing";
import { MessageData } from "./WorkerProxy";

/**
 * Worker commons
 */

const onSetup = (envSettings: any) => {
  // apply settings in worker's environment
  worldRootEnv.fromStub(envSettings)
  const done = true
  return { done }
}

const onTask = async (taskStub: GenericTaskStub) => {
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

export const onMessage = async (request: MessageData<WorldEnvSettings | GenericTaskStub>) => {
  const { timestamp, content } = request
  // console.log(`[worker] received task ${eventData.taskId} `)
  // const { id, task } = data
  const res = (content as GenericTaskStub).taskId ? await onTask(content as GenericTaskStub) :
    await onSetup(content as WorldEnvSettings)
  // eslint-disable-next-line no-undef
  const workerReply = { timestamp, content: res }
  return workerReply
}