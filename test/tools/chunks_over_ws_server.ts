/**
* node server side POC aming to show
- chunks streaming over websocket capabilites
- ability to run chunks generation in node environment
- distributed computing on remote device (for monitoring, local dev purposes)
*/

import { WebSocketServer, WebSocket } from 'ws'

import { WorkerPool } from '../../src/node/NodeWorkerPool.js'
import { getWorldDemoEnv } from '../configs/world_demo_setup.js'
import { ChunksPolling } from '../../src/tools/ChunksPolling.js'
import { parseThreeStub } from '../../src/utils/patch_chunk.js'

const SERVER_PORT = 3000
const POOL_SIZE = 4

const initWsServer = async () => {
    const world_demo_env = getWorldDemoEnv()
    const chunks_node_worker_pool = new WorkerPool()
    await chunks_node_worker_pool.initPoolEnv(POOL_SIZE, world_demo_env)
    const patchViewRanges = {
        near: 2,
        far: 4,
    }
    const chunks_scheduler = new ChunksPolling(patchViewRanges, world_demo_env.getChunksVerticalRange())

    const wsClients: Record<number, WebSocket> = {}
    const wss = new WebSocketServer({ port: SERVER_PORT })

    const onClientChunksPolling = (clientMsg: any, clientWs: any) => {
        const request = JSON.parse(clientMsg)
        console.log('received client request:', request)
        const { viewPos, viewRange } = request

        const chunks_tasks = chunks_scheduler.pollChunks(parseThreeStub(viewPos), viewRange)
        chunks_tasks?.forEach(chunks_task =>
            chunks_task.delegate(chunks_node_worker_pool).then(chunk_blob => {
                console.log(`sending `, chunk_blob)
                clientWs.send(chunk_blob)
            }),
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
