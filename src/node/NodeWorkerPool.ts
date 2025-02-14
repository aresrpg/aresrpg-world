import { WorkerPool } from "../processing/WorkerPool";
import { NodeWorkerProxy } from "./NodeWorkerProxy";

export class NodeWorkerPool extends WorkerPool {
    override init(poolSize: number): void {
        console.log(`create worker pool size: ${poolSize} `)
        for (let workerId = 0; workerId < poolSize; workerId++) {
            const workerProxy = new NodeWorkerProxy(workerId)
            workerProxy.init()
            this.workerPool.push(workerProxy)
        }
    }
}