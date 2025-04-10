import { WorldLocals } from '../config/WorldEnv.js'
import { WorkerPool as BaseWorkerPool } from '../processing/WorkerPool.js'

import { NodeWorkerProxy } from './NodeWorkerProxy.js'

export class WorkerPool extends BaseWorkerPool {
    override async initPoolEnv(poolSize: number, worldLocalEnv: WorldLocals) {
        const { workerPoolName } = this
        console.log(`create worker pool ${workerPoolName} size: ${poolSize} `)
        const pendingInits = []
        for (let workerId = 0; workerId < poolSize; workerId++) {
            const workerSuffix = poolSize > 1 ? `_${workerId}` : ''
            const workerName = workerPoolName + '-worker' + workerSuffix
            const workerProxy = new NodeWorkerProxy(workerName)
            const pendingInit = workerProxy.init(worldLocalEnv)
            pendingInits.push(pendingInit)
            this.workerPool.push(workerProxy)
        }
        await Promise.all(pendingInits).then(() => {
            this.ready = true
            this.processQueue()
        })
    }
}
