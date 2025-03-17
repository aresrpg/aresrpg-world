/**
* node server side POC aming to show
- chunks streaming over websocket capabilites
- ability to run chunks generation in node environment
- distributed computing on remote device (for monitoring, local dev purposes)
*/

import { Worker } from 'worker_threads'

import { WebSocketServer, WebSocket } from 'ws'

import { WorkerPool } from '../node/NodeWorkerPool.js'
import { ChunksPolling, parseThreeStub } from '../index.js'
import { getWorldDemoEnv } from '../../test/configs/world_demo_setup.js'

const SERVER_PORT = 3000
const POOL_SIZE = 4

const initWsServer = async () => {
  const world_demo_env = getWorldDemoEnv()
  const chunks_node_worker_pool = new WorkerPool()
  const nodeWorker = new Worker(
    new URL('./world_compute_node_worker.js', import.meta.url),
  )
  await chunks_node_worker_pool.initPoolEnv(
    POOL_SIZE,
    world_demo_env,
    nodeWorker,
  )
  const chunks_scheduler = new ChunksPolling(
    world_demo_env.rawSettings.patchViewRanges,
    world_demo_env.getChunksVerticalRange(),
  )

  const wsClients: Record<number, WebSocket> = {}
  const wss = new WebSocketServer({ port: SERVER_PORT })

  const onClientChunksPolling = (clientMsg: any, clientWs: any) => {
    const request = JSON.parse(clientMsg)
    console.log('received client request:', request)
    const { viewPos, viewRange } = request

    const chunks_tasks = chunks_scheduler.pollChunks(
      parseThreeStub(viewPos),
      viewRange,
    )
    chunks_tasks?.forEach(chunks_task =>
      chunks_task
        .delegate(chunks_node_worker_pool)
        .then(chunk_blob => clientWs.send(chunk_blob)),
    )
    // const clientTask = wsRequest.task
    // this.enqueueTasks(clientTask)
  }

  wss.on('connection', ws => {
    const clientId = Object.keys(wsClients).length
    console.log(`client ${clientId} has connected.`)
    wsClients[clientId] = ws
    ws.on('message', msg => onClientChunksPolling(msg, ws))
  })

  console.log(`web socket server listening on ws://localhost:${SERVER_PORT}`)
}

initWsServer().then(() => console.log(`chunks stream service running`))
