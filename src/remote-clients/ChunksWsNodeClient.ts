/**
 * To be run client side to request chunks to remote service
 */

import WebSocket from 'ws'; // Import the WebSocket module
import { Vector2 } from "three"
import { PatchViewRange } from "../processing/ChunksScheduling"
import { chunkStubfromBlobBuffer } from '../utils/chunk_utils';

const WS_URL = 'ws://localhost:3000'

export class ChunksWsNodeClient {
    ws: WebSocket
    centerPatch = new Vector2(NaN, NaN)
    //   patchIndex: Record<PatchKey, any> = {}
    patchViewRange: PatchViewRange = {
        near: 0,
        far: 0,
    }

    constructor() {
        // Connect to the WebSocket server
        this.initWs()
    }

    initWs = async () => {
        const ws = await new Promise<WebSocket>(resolve => {
            const ws = new WebSocket(WS_URL);
            ws.on('open', () => {
                console.log('WebSocket connection opened');
                resolve(ws)
                // Send a message to the server
                // ws.send('Hello, from client!');
            });

            // When a message is received from the server
            ws.on('message', (rawdata: Buffer) => {
                chunkStubfromBlobBuffer(rawdata).then(chunk => console.log(chunk))
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // When the connection is closed
            ws.on('close', () => {
                console.log('WebSocket connection closed');
            });
        })
        this.ws = ws
        return ws
    }

    viewChanged(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
        const viewChanged =
            this.centerPatch.distanceTo(centerPatch) > 0 ||
            this.patchViewRange.near !== rangeNear ||
            this.patchViewRange.far !== rangeFar
        return viewChanged
    }

    scheduleRemoteTasks(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
        if (this.viewChanged(centerPatch, rangeNear, rangeFar)) {
            const view = {
                center: centerPatch,
                near: rangeNear,
                far: rangeFar
            }
            this.ws.send(JSON.stringify(view))
        }
    }

}
