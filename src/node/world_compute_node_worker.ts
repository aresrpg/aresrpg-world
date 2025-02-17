import { parentPort } from 'worker_threads'

import '../processing/BlocksProcessing.js'
import '../processing/ChunksProcessing.js'
import '../processing/ItemsProcessing.js'

import { workerRequestHandler } from '../processing/WorkerProxy.js'

const initNodeWorker = () => {
  parentPort?.on('unhandledrejection', e => {
    console.error('Worker script unhandled rejection:', e)
    parentPort?.postMessage({ type: 'error', message: e.reason })
  })

  parentPort?.on('error', e => {
    console.error(e)
    parentPort?.postMessage({ type: 'error', message: e.message })
  })

  parentPort?.on('message', async requestData => {
    const reply = await workerRequestHandler(requestData)
    parentPort?.postMessage(reply)
  })
}

// init worker code
initNodeWorker()
