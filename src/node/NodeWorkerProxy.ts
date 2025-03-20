import { WorkerProxy } from '../processing/WorkerProxy.js'
import { WorldLocals } from '../config/WorldEnv.js'

export class NodeWorkerProxy extends WorkerProxy {
  override init(
    worldLocalEnv: WorldLocals,
    createWorker: () => any,
  ): Promise<any> {
    const nodeWorker = createWorker()
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
