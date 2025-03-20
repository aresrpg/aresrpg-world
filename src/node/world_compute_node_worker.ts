import { parentPort } from 'worker_threads'
import { onMessage } from '../processing/WorldWorker.js'

const initNodeWorker = () => {
  parentPort?.on('unhandledrejection', e => {
    console.error('Worker script unhandled rejection:', e)
    parentPort?.postMessage({ type: 'error', message: e.reason })
  })

  parentPort?.on('error', e => {
    console.error(e)
    parentPort?.postMessage({ type: 'error', message: e.message })
  })

  parentPort?.on('message', async incomingData => {
    const replyData = await onMessage(incomingData)
    parentPort?.postMessage(replyData)
  })
}

// init worker code
initNodeWorker()
