import { Worker } from "worker_threads"
import { ChunksStreamOverWS } from "../remote-services/ChunksStreamOverWS"
import { NodeWorkerProxy } from "../processing/NodeWorkerProxy"
import { WorkerPool } from "../processing/WorkerPool"

const WORLD_WORKER_URL = './dist/tests/node_worker'
const DEFAULT_POOL_SIZE = 4

const chunks_service_worker_pool = new WorkerPool<Worker>()
chunks_service_worker_pool.init(WORLD_WORKER_URL, DEFAULT_POOL_SIZE, NodeWorkerProxy)

const chunks_ws_srv = new ChunksStreamOverWS(chunks_service_worker_pool)