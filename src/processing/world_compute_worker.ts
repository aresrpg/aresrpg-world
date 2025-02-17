/**
 * Task processing worker
 */

import { WorldEnvSettings } from '../config/WorldEnv.js'

import './BlocksProcessing.js'
import './ChunksProcessing.js'
import './ItemsProcessing.js'

import { GenericTaskStub } from './TaskProcessing.js'
import { MessageData, workerRequestHandler } from './WorkerProxy.js'

const initWebWorker = () => {
  // eslint-disable-next-line no-undef
  addEventListener('message', messageHandler)
  // eslint-disable-next-line no-undef
  addEventListener('error', errorHandler)
  // eslint-disable-next-line no-undef
  addEventListener('unhandledrejection', unhandledRejectionHandler)
}

const messageHandler = async (
  e: MessageEvent<MessageData<GenericTaskStub | WorldEnvSettings>>,
) => {
  const reply = await workerRequestHandler(e.data)
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

initWebWorker()
