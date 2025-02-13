import { WorkerProxy } from "../processing/WorkerProxy";
import { Worker } from 'worker_threads'

export class NodeWorkerProxy extends WorkerProxy {
    init() {
        // node env
        const workerUrl = new URL('./world_compute_node_worker', import.meta.url)
        const nodeWorker = new Worker(workerUrl)
        // const nodeWorker = new Worker('./world_compute_node_worker.js')
        nodeWorker.on('message', this.handleWorkerReply)
        this.worker = nodeWorker
        console.log(`node worker is up`)
        return nodeWorker as any
    }
}