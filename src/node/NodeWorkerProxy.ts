import { Worker } from 'worker_threads'

import { WorkerProxy } from '../processing/WorkerProxy.js'

export class NodeWorkerProxy extends WorkerProxy {
  override init() {
    // node env
    const workerUrl = new URL('./world_compute_node_worker.js', import.meta.url)
    const nodeWorker = new Worker(workerUrl)
    // const nodeWorker = new Worker('./world_compute_node_worker.js')
    nodeWorker.on('message', this.handleWorkerReply)
    this.worker = nodeWorker
    return nodeWorker as any
  }
}
