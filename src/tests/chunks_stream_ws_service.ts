import { Worker } from "worker_threads"
import { ChunksWsService } from "../tools/ChunksWsNodeService"
import { NodeWorkerProxy } from "../processing/NodeWorkerProxy"
import { WorkerPool } from "../processing/WorkerPool"

const WORLD_WORKER_URL = './dist/tests/node_worker'
const DEFAULT_POOL_SIZE = 4

const createWorkerProxy = (workerId?: number) => new NodeWorkerProxy(WORLD_WORKER_URL, workerId)

const chunks_service_worker_pool = new WorkerPool<Worker>()
chunks_service_worker_pool.init(createWorkerProxy, DEFAULT_POOL_SIZE)

const chunks_ws_srv = new ChunksWsService(chunks_service_worker_pool)