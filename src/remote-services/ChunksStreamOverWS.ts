import { WebSocketServer, WebSocket } from 'ws'

import { parseThreeStub } from '../utils/patch_chunk.js'
import { ChunksScheduler } from '../processing/ChunksScheduling.js'
import { WorkerPool } from '../index.js'

/**
 * Chunks streaming over websocket to remote client
 */
export class ChunksStreamOverWS extends ChunksScheduler {
  clientsCount = 0
  clients: Record<number, WebSocket> = {}

  constructor(nodeWorkerPool: WorkerPool, port = 3000) {
    super(nodeWorkerPool)
    const wss = new WebSocketServer({ port })

    wss.on('connection', ws => {
      const clientId = this.clientsCount++
      console.log(`Client ${clientId} has connected.`)
      this.clients[clientId] = ws
      ws.on('message', msg => this.handleClientRequest(msg, ws))
    })

    console.log('WebSocket server started on ws://localhost:3000')
  }

  handleClientRequest = (clientMsg: any, clientWs: any) => {
    const request = JSON.parse(clientMsg)
    console.log('Received client request:', request)
    const { near, far } = request
    const center = parseThreeStub(request.center)
    this.onChunkAvailable = async (chunkBlob: Blob) => {
      // const chunkBlob = await chunk.toCompressedBlob()
      console.log(chunkBlob)
      // const { chunkKey } = chunk.
      // console.log(chunk)
      // const reply = JSON.stringify({ chunkKey })
      clientWs.send(chunkBlob)
    }
    this.requestChunks(center, near, far)

    // const clientTask = wsRequest.task
    // this.enqueueTasks(clientTask)
  }
}

// export class WorkerPoolWsService extends WorkerPool<Worker> {
