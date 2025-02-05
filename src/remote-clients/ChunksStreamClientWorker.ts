import { chunkStubFromCompressedBlob } from "../utils/chunk_utils"

/**
 * Chunks stream over web socket client worker 
 */

export const chunksStreamClientWorkerSetup = (wsUrl: string, chunkDataAdapter?: (chunkStub: any) => any) => {

    const wsClientSetup = (wsUrl: string) => {

        const onChunkDataReceived = async (chunkCompressedBlob: Blob) => {
            // process raw data blob received from server
            const chunkStub = await chunkStubFromCompressedBlob(chunkCompressedBlob)
            const chunkData = chunkDataAdapter?.(chunkStub) || chunkStub
            // and forward chunk data to client
            self.postMessage(chunkData)
        }

        const ws = new WebSocket(wsUrl)

        const wsInitState = new Promise((resolve, reject) => {
            ws.onopen = () => resolve(ws)
            ws.onmessage = msgEvt => onChunkDataReceived(msgEvt.data)
            ws.onerror = error => reject(error)
            ws.onclose = () => console.log('WebSocket connection closed')
        })

        /**
         * forward chunks request to server through WS
         */
        const chunksRequestForwarder = (input: any) => {
            switch (ws.readyState) {
                case 0:
                    console.log(`waiting for ws client to be ready`)
                    break;
                case 1:
                    ws.send(JSON.stringify(input))
                    break;
                default:
                    console.log(`ws client can't be initialized`)

            }
        }

        return { chunksRequestForwarder, wsInitState }
    }

    const { chunksRequestForwarder, wsInitState } = wsClientSetup(wsUrl)

    const messageHandler = async (e: MessageEvent<any>) => {
        const eventData = e.data
        // forwarding request through websocket
        chunksRequestForwarder(eventData)
    }

    const errorHandler = (e: ErrorEvent) => {
        console.error(e)
        // eslint-disable-next-line no-undef
        self.postMessage({ type: 'error', message: e.message })
    }

    const unhandledRejectionHandler = (e: PromiseRejectionEvent) => {
        console.error('Worker script unhandled rejection:', e)
        // eslint-disable-next-line no-undef
        self.postMessage({ type: 'error', message: e.reason })
    }

    const initWorkerEventsHandlers = () => {
        addEventListener('message', messageHandler)
        addEventListener('error', errorHandler)
        addEventListener('unhandledrejection', unhandledRejectionHandler)
    }

    initWorkerEventsHandlers()

    return { wsInitState }
}