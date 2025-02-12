import { ChunksStreamOverWS } from '../remote-services/ChunksStreamOverWS.js'
import { WorkerPool } from '../processing/WorkerPool.js'

const WORLD_WORKER_URL = './dist/tests/world_compute_node_worker'
const DEFAULT_POOL_SIZE = 4

const chunks_service_worker_pool = new WorkerPool()
chunks_service_worker_pool.init(WORLD_WORKER_URL, DEFAULT_POOL_SIZE)

const chunks_ws_srv = new ChunksStreamOverWS(chunks_service_worker_pool)
console.log(chunks_ws_srv)
