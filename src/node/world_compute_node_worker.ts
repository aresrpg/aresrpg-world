import { parentPort } from 'worker_threads'
import { workerRequestHandler } from '../processing/WorkerProxy'

const initNodeWorker = () => {
  parentPort?.on('unhandledrejection', (e) => {
    console.error('Worker script unhandled rejection:', e)
    parentPort?.postMessage({ type: 'error', message: e.reason })
  })

  parentPort?.on('error', (e) => {
    console.error(e)
    parentPort?.postMessage({ type: 'error', message: e.message })
  })

  parentPort?.on('message', async requestData => {
    const reply = workerRequestHandler(requestData)
    parentPort?.postMessage(reply)
  })
}

// init worker code
// initNodeWorker()
initNodeWorker()
// configure worker's own world environment
// setupWorldDemo(WorldEnv.current)
// WorldEnv.current.apply()
