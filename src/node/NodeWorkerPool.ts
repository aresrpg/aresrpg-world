import { WorldEnv } from "../config/WorldEnv";
import { WorkerPool } from "../processing/WorkerPool";
import { NodeWorkerProxy } from "./NodeWorkerProxy";

export class NodeWorkerPool extends WorkerPool {

    override async initPoolEnv(poolSize: number, worldEnv: WorldEnv): Promise<void> {
            console.log(`create worker pool size: ${poolSize} `)
            const pendingInits = []
            for (let workerId = 0; workerId < poolSize; workerId++) {
              const workerProxy = new NodeWorkerProxy(workerId)
              const pendingInit = workerProxy.init(worldEnv)
              pendingInits.push(pendingInit)
              this.workerPool.push(workerProxy)
            }
            await Promise.all(pendingInits).then(() => {
              this.isReady = true
              this.processQueue()
            })
    }

}