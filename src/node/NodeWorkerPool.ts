import { WorldLocals } from '../config/WorldEnv.js'
import { WorkerPool as BaseWorkerPool } from '../processing/WorkerPool.js'

import { NodeWorkerProxy } from './NodeWorkerProxy.js'

export class WorkerPool extends BaseWorkerPool {
  override async initPoolEnv(
    poolSize: number,
    worldLocalEnv: WorldLocals,
    createWorker?: () => any,
  ) {
    console.log(`create worker pool size: ${poolSize} `)
    const pendingInits = []
    for (let workerId = 0; workerId < poolSize; workerId++) {
      const workerProxy = new NodeWorkerProxy(workerId)
      const pendingInit = workerProxy.init(worldLocalEnv, createWorker)
      pendingInits.push(pendingInit)
      this.workerPool.push(workerProxy)
    }
    await Promise.all(pendingInits).then(() => {
      this.ready = true
      this.processQueue()
    })
  }
}
