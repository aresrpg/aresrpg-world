import {
  ProcessingTaskStub,
  ProcessingTask,
  ProcessingContext,
} from './TaskProcessing'

/**
 * Task processing worker
 */
export const taskWorkerSetup = () => {
  const messageHandler = async (
    e: MessageEvent<ProcessingTaskStub<any, any>>,
  ) => {
    const eventData = e.data
    // console.log(`[worker] received task ${eventData.taskId} `)
    // const { id, task } = data
    const reply = {
      id: eventData.taskId,
      data: null,
    }
    const taskHandler = ProcessingTask.taskHandlers[eventData.handlerId]
    if (taskHandler) {
      const taskOutput = await taskHandler(eventData, ProcessingContext.Worker)
      reply.data = taskOutput
    }
    // eslint-disable-next-line no-undef
    self.postMessage(reply)
  }

  // eslint-disable-next-line no-undef
  const errorHandler = (e: ErrorEvent) => {
    console.error(e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.message })
  }

  // eslint-disable-next-line no-undef
  const unhandledRejectionHandler = (e: PromiseRejectionEvent) => {
    console.error('Worker script unhandled rejection:', e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.reason })
  }

  // eslint-disable-next-line no-undef
  addEventListener('message', messageHandler)
  // eslint-disable-next-line no-undef
  addEventListener('error', errorHandler)
  // eslint-disable-next-line no-undef
  addEventListener('unhandledrejection', unhandledRejectionHandler)
}
