import { Worker } from 'worker_threads'

import { WorkerProxy } from '../processing/WorkerProxy.js'
import { WorldLocals } from '../config/WorldEnv.js'

export class NodeWorkerProxy extends WorkerProxy {
  override init(worldLocalEnv: WorldLocals): Promise<any> {
    // node env
    const workerUrl = new URL('./world_compute_node_worker.js', import.meta.url)
    const nodeWorker = new Worker(workerUrl)
    // const nodeWorker = new Worker('./world_compute_node_worker.js')
    nodeWorker.on('message', this.handleWorkerReply)
    this.worker = nodeWorker
    const timestamp = Date.now()
    const pendingInit = new Promise<any>(
      resolve => (this.resolvers[timestamp] = resolve),
    )
    this.worker.postMessage({ timestamp, content: worldLocalEnv.toStub() })
    // pendingInit.then(() => console.log(`worker is ready`))
    return pendingInit
  }
}
