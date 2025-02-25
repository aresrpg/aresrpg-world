/**
* node server side POC aming to show
- chunks streaming over websocket capabilites
- ability to run chunks generation in node environment
- distributed computing on remote device (for monitoring, local dev purposes)
*/

import { WebSocketServer, WebSocket } from 'ws'

import { getWorldDemoEnvSettings } from '../config/demo/world_demo_setup.js'
import { WorkerPool } from '../node/NodeWorkerPool.js'
import { ChunksPolling, parseThreeStub } from '../index.js'

const SERVER_PORT = 3000
const POOL_SIZE = 4

const initWorkerpool = async () => {
  const world_demo_env = getWorldDemoEnvSettings()
  const chunks_node_worker_pool = new WorkerPool()
  await chunks_node_worker_pool.init(POOL_SIZE)
  await chunks_node_worker_pool.loadWorldEnv(world_demo_env)
  const chunks_scheduler = new ChunksPolling()
  chunks_scheduler.chunksWorkerPool = chunks_node_worker_pool
  return chunks_scheduler
}

const initWsServer = async () => {
  const chunksScheduler = await initWorkerpool()
  const wsClients: Record<number, WebSocket> = {}
  const wss = new WebSocketServer({ port: SERVER_PORT })

  const onClientChunksPolling = (clientMsg: any, clientWs: any) => {
    const request = JSON.parse(clientMsg)
    console.log('received client request:', request)
    const { viewPos, viewRange } = request

    const scheduledTasks = chunksScheduler.pollChunks(
      parseThreeStub(viewPos),
      viewRange,
    )
    scheduledTasks?.forEach(scheduledTask =>
      scheduledTask.then(chunkBlob => clientWs.send(chunkBlob)),
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
