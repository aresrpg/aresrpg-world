/**
 * Task processing worker
 */

import './BlocksProcessing'
import './ChunksProcessing'
import './ItemsProcessing'
import { onMessage } from './WorldWorker'

// import {
//   GenericTaskStub,
// } from './TaskProcessing'
// import { MessageData, workerRequestHandler } from './WorkerProxy'


const initWebWorker = () => {
  // eslint-disable-next-line no-undef
  addEventListener('message', async (e: MessageEvent<any>) => {
    const replyData = await onMessage(e.data)
    self.postMessage(replyData)
  })
  // eslint-disable-next-line no-undef
  addEventListener('error', (e: ErrorEvent) => {
    console.error(e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.message })
  })
  // eslint-disable-next-line no-undef
  addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    console.error('Worker script unhandled rejection:', e)
    // eslint-disable-next-line no-undef
    self.postMessage({ type: 'error', message: e.reason })
  })
}

initWebWorker()