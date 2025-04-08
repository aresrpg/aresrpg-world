/**
 * Task processing worker
 */
import { onMessage } from './WorldWorker.js'

// import {
//   GenericTaskStub,
// } from './TaskProcessing'
// import { MessageData, workerRequestHandler } from './WorkerProxy'

export const initWebWorker = () => {
    // eslint-disable-next-line no-undef
    globalThis.addEventListener('message', async (e: MessageEvent<any>) => {
        const replyData = await onMessage(e.data)
        globalThis.postMessage(replyData)
    })
    // eslint-disable-next-line no-undef
    globalThis.addEventListener('error', (e: ErrorEvent) => {
        console.error(e)
        // eslint-disable-next-line no-undef
        globalThis.postMessage({ type: 'error', message: e.message })
    })
    // eslint-disable-next-line no-undef
    globalThis.addEventListener('unhandledrejection', (e: any) => {
        console.error('Worker script unhandled rejection:', e)
        // eslint-disable-next-line no-undef
        globalThis.postMessage({ type: 'error', message: e.reason })
    })
}

initWebWorker()
