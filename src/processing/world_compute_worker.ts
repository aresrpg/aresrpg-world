import { WorldEnvSettings } from '../config/WorldEnv.js'

import './BlocksProcessing.js'
import './ChunksProcessing.js'
import './ItemsProcessing.js'
import { GenericTaskStub } from './TaskProcessing.js'
import { MessageData, workerRequestHandler } from './WorkerProxy.js'

const initWebWorker = () => {
  globalThis.addEventListener('message', messageHandler)
  globalThis.addEventListener('error', errorHandler)
  globalThis.addEventListener('unhandledrejection', unhandledRejectionHandler)
}

const messageHandler = async (
  e: MessageEvent<MessageData<GenericTaskStub | WorldEnvSettings>>,
) => {
  const reply = await workerRequestHandler(e.data)
  globalThis.postMessage(reply)
}

// eslint-disable-next-line no-undef
const errorHandler = (e: ErrorEvent) => {
  console.error('Worker script error:', e)
  globalThis.postMessage({ type: 'error', message: e.message })
}

// eslint-disable-next-line no-undef
const unhandledRejectionHandler = (e: PromiseRejectionEvent) => {
  console.error('Worker script unhandled rejection:', e)
  globalThis.postMessage({ type: 'error', message: e.reason })
}

initWebWorker()
