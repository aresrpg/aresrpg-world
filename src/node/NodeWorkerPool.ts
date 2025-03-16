import { WorkerPool as BaseWorkerPool } from '../processing/WorkerPool.js'

import { NodeWorkerProxy } from './NodeWorkerProxy.js'

export class WorkerPool extends BaseWorkerPool {
  override init(poolSize: number, worker: any): void {
    for (let workerId = 0; workerId < poolSize; workerId++) {
      const workerProxy = new NodeWorkerProxy(workerId)
      workerProxy.init(worker)
      this.workerPool.push(workerProxy)
    }
  }
}
