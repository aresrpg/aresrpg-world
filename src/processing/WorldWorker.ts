import { WorldLocalSettings } from '../config/WorldEnv.js'
import { createWorldModules, WorldModules } from '../WorldModules.js'

import { GenericTaskStub, ProcessingContext } from './TaskProcessing.js'
import { MessageData } from './WorkerProxy.js'

let worldModules: WorldModules

/**
 * Worker commons
 */

const onSetup = (worldLocalSettings: WorldLocalSettings) => {
  // apply settings in worker's environment
  worldModules = createWorldModules(worldLocalSettings)
  // worldRootEnv.fromStub(envSettings)
  const done = true
  return { done }
}

const onTask = async (taskStub: GenericTaskStub) => {
  const reply = {
    id: taskStub.taskId,
    data: null,
  }
  const taskHandler = worldModules.taskHandlers[taskStub.handlerId]

  if (taskHandler) {
    const taskOutput = await taskHandler(taskStub, ProcessingContext.Worker)
    reply.data = taskOutput
  }
  return reply
}

export const onMessage = async (
  request: MessageData<WorldLocalSettings | GenericTaskStub>,
) => {
  const { timestamp, content } = request
  // console.log(`[worker] received task ${eventData.taskId} `)
  // const { id, task } = data
  const res = (content as GenericTaskStub).taskId
    ? await onTask(content as GenericTaskStub)
    : await onSetup(content as WorldLocalSettings)
  // eslint-disable-next-line no-undef
  const workerReply = { timestamp, content: res }
  return workerReply
}
