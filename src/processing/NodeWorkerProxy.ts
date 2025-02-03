import { Worker, parentPort, workerData, threadId } from "worker_threads"
import { WorkerProxy } from "./WorkerProxy"

/**
 * Worker proxy adapted for node environment
 */
export class NodeWorkerProxy extends WorkerProxy<Worker> {
    initWorker(workerUrl: string | URL): Worker {

        const handleWorkerReply = (workerReply: any) => {
            if (workerReply.id !== undefined) {
                const taskResolver = this.resolvers[workerReply.id]
                taskResolver(workerReply.data)
                delete this.resolvers[workerReply.id]
            }
        }

        const nodeWorker = new Worker(workerUrl)
        nodeWorker.on('message', handleWorkerReply)
        // nodeWorker.on('message', (data) => console.log(`reply received from worker: `, data))
        return nodeWorker
    }
}