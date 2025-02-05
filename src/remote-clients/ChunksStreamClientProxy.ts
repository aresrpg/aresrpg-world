// import WebSocket from 'ws'; // Import the WebSocket module
import { Vector2 } from 'three'

import { PatchViewRange } from '../processing/ChunksScheduling'
import { asVect3, WorldEnv } from '../index'
import { ChunkId, PatchId, PatchKey } from '../utils/common_types'
import { genPatchMapIndex, parsePatchKey } from '../utils/patch_chunk'

const chunksRange = WorldEnv.current.chunks.range

export class ChunksStreamClientProxy {
  // eslint-disable-next-line no-undef
  worker: Worker
  centerPatch = new Vector2(NaN, NaN)
  patchIndex: Record<PatchKey, any> = {}
  patchViewRange: PatchViewRange = {
    near: 0,
    far: 0,
  }

  onChunkAvailable?: any
  onServiceFail?: any

  constructor(chunksClientWorkerUrl: string) {
    // eslint-disable-next-line no-undef
    const worker = new Worker(chunksClientWorkerUrl, { type: 'module' })
    worker.onmessage = (workerReply: MessageEvent<any>) => {
      workerReply.data.type !== 'error'
        ? this.onChunkReceived(workerReply.data)
        : this.onServiceFail(workerReply.data?.message)
    }
    this.worker = worker
  }

  get patchKeys() {
    return Object.keys(this.patchIndex)
  }

  get chunkIds() {
    const { bottomId, topId } = chunksRange
    const chunkIds: ChunkId[] = []
    this.patchKeys.forEach(patchKey => {
      const patchId = parsePatchKey(patchKey) as PatchId
      for (let y = topId; y >= bottomId; y--) {
        const chunkId = asVect3(patchId, y)
        chunkIds.push(chunkId)
      }
    })
    return chunkIds
  }

  async onChunkReceived(chunkData: any) {
    this.onChunkAvailable?.(chunkData)
  }

  viewChanged(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
    const viewChanged =
      this.centerPatch.distanceTo(centerPatch) > 0 ||
      this.patchViewRange.near !== rangeNear ||
      this.patchViewRange.far !== rangeFar
    return viewChanged
  }

  requestChunks(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
    if (this.viewChanged(centerPatch, rangeNear, rangeFar)) {
      this.patchIndex = genPatchMapIndex(centerPatch, rangeFar)
      const viewState = {
        center: centerPatch,
        near: rangeNear,
        far: rangeFar,
      }
      this.worker.postMessage(viewState)
    }
  }
}
