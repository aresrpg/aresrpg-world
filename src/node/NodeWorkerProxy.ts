import { WorkerProxy } from '../processing/WorkerProxy.js'

export class NodeWorkerProxy extends WorkerProxy {
  override init(nodeWorker: any) {
    // const nodeWorker = new Worker('./world_compute_node_worker.js')
    nodeWorker.on('message', this.handleWorkerReply)
    this.worker = nodeWorker
    return nodeWorker as any
  }
}
