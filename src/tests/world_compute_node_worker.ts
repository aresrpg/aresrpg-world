import { parentPort } from 'worker_threads'

import { setupWorldDemo } from '../config/demo-samples/world_demo_setup'
import { WorldEnv } from '../config/WorldEnv'
import { ProcessingContext, ProcessingTask } from '../processing/TaskProcessing'

const initWorkerListeners = () => {
  // eslint-disable-next-line no-undef
  parentPort?.on('unhandledrejection', (e: PromiseRejectionEvent) => {
    console.error('Worker script unhandled rejection:', e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.reason })
  })
  // eslint-disable-next-line no-undef
  parentPort?.on('error', (e: ErrorEvent) => {
    console.error(e)
    // eslint-disable-next-line no-undef
    parentPort?.postMessage({ type: 'error', message: e.message })
  })
  // eslint-disable-next-line no-undef
  parentPort?.on('message', async taskData => {
    // console.log(`[worker] received task ${taskData.taskId} `)
    // const { id, task } = data
    const reply = {
      id: taskData.taskId,
      data: null,
    }
    const taskHandler = ProcessingTask.taskHandlers[taskData.handlerId]
    if (taskHandler) {
      const taskOutput = await taskHandler(taskData, ProcessingContext.Worker)
      reply.data = taskOutput
      // console.log(`send task reply: `, taskOutput)
    }
    // eslint-disable-next-line no-undef
    parentPort?.postMessage(reply)
  })
}

// init worker code
// initNodeWorker()
initWorkerListeners()
// configure worker's own world environment
setupWorldDemo(WorldEnv.current)
WorldEnv.current.apply()
