import { ChunkMetadata, ChunkStub } from '../../src/datacontainers/ChunkContainer.js'
import { chunksFromCompressedBlob } from '../../src/index.js'

/**
 * WS client side
 */
export const chunksWsClient = (
  wsUrl: string,
  onChunkReceived: (chunkStub: ChunkStub<ChunkMetadata>) => any,
) => {
  // to replace onChunkReceived arg
  // const onChunkReceivedRef = {
  //   current: (data:ChunkStub)=>console.log(data)
  // }
  const onChunkDataReceived = async (chunkCompressedBlob: Blob) => {
    // process raw data blob received from server
    const chunkStubs = await chunksFromCompressedBlob(chunkCompressedBlob)
    chunkStubs.forEach(chunkStub => onChunkReceived(chunkStub))
  }

  // eslint-disable-next-line no-undef
  const ws = new WebSocket(wsUrl)

  const wsInitState = new Promise((resolve, reject) => {
    ws.onopen = () => resolve(ws)
    ws.onmessage = msgEvt => onChunkDataReceived(msgEvt.data)
    ws.onerror = error => reject(error)
    ws.onclose = () => console.log('WebSocket connection closed')
  })

  /**
   * provides callback to client to perform chunks requests over WS
   */
  const requestChunkOverWs = (input: any) => {
    switch (ws.readyState) {
      case 0:
        console.log(`waiting for ws client to be ready`)
        break
      case 1:
        ws.send(JSON.stringify(input))
        break
      default:
        console.log(`ws client can't be initialized`)
    }
  }

  return { requestChunkOverWs, wsInitState }
}
