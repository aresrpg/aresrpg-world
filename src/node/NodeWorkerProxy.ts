import { Worker } from 'worker_threads'

import { WorldEnv } from '../config/WorldEnv.js'
import { WorkerProxy } from '../processing/WorkerProxy.js'

export class NodeWorkerProxy extends WorkerProxy {
  override init(worldEnv: WorldEnv): Promise<any> {
    // node env
    const workerUrl = new URL('./world_compute_node_worker.js', import.meta.url)
    const nodeWorker = new Worker(workerUrl)
    // const nodeWorker = new Worker('./world_compute_node_worker.js')
    nodeWorker.on('message', this.handleWorkerReply)
    this.worker = nodeWorker
    console.log(`node worker is up`)
    const timestamp = Date.now()
    const pendingInit = new Promise<any>(
      resolve => (this.resolvers[timestamp] = resolve),
    )
    this.worker.postMessage({ timestamp, content: worldEnv.toStub() })
    pendingInit.then(() => console.log(`worker is ready`))
    return pendingInit
  }
}
