import { Worker } from "worker_threads"
import { WebSocketServer } from 'ws';
import { WorkerPool } from '..';
import { ChunkContainer } from "../index";
import { parseThreeStub } from "../utils/patch_chunk";
import { ChunksScheduler } from "../processing/ChunksScheduling";

/**
 * To be run server side to listen to ws requests from client
 */
export class ChunksWsService extends ChunksScheduler {
  clientsCount = 0
  clients = {}

  constructor(nodeWorkerPool: WorkerPool<Worker>, port = 3000) {
    super(nodeWorkerPool);
    const wss = new WebSocketServer({ port: 3000 });

    wss.on('connection', (ws) => {
      const clientId = this.clientsCount++
      console.log(`Client ${clientId} has connected.`);
      this.clients[clientId] = ws
      ws.on('message', (msg) => this.handleClientRequest(msg, ws));
    });

    console.log('WebSocket server started on ws://localhost:3000');
  }

  handleClientRequest = (clientMsg: any, clientWs: any) => {
    const request = JSON.parse(clientMsg)
    console.log('Received client request:', request);
    const { near, far } = request
    const center = parseThreeStub(request.center)
    this.onChunkAvailable = async (chunk: ChunkContainer) => {
      const chunkBlob = await chunk.toBlob()
      console.log(chunkBlob)
      // const { chunkKey } = chunk.
      // console.log(chunk)
      // const reply = JSON.stringify({ chunkKey })
      clientWs.send(chunkBlob);
    }
    this.scheduleTasks(center, near, far)

    // const clientTask = wsRequest.task
    // this.enqueueTasks(clientTask)
  }
}







// export class WorkerPoolWsService extends WorkerPool<Worker> {