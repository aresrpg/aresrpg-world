import { parentPort } from 'worker_threads'

import { blocksProcessingHandler } from '../processing/BlocksProcessing'
import { chunksProcessingTaskHandler } from '../processing/ChunksProcessing'
import { itemsProcessingTaskHandler } from '../processing/ItemsProcessing'
import { workerRequestHandler } from '../processing/WorkerProxy'

// hack for bundling external deps into worker
;(() => {
  chunksProcessingTaskHandler
  itemsProcessingTaskHandler
  blocksProcessingHandler
})()

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
