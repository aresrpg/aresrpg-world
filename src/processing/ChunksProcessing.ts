import { Vector2 } from 'three'

import { WorldEnv } from '../config/WorldEnv'
import {
  parsePatchKey,
  asVect3,
  serializeChunkId,
  asPatchBounds,
} from '../utils/convert'
import { PatchId, PatchKey } from '../utils/types'

import { ChunkContainer, ChunkStub, defaultDataEncoder } from '../datacontainers/ChunkContainer'
import { GroundPatch } from './GroundPatch'
import { ItemsChunkLayer } from './ItemsProcessing'
import { ProcessingState, ProcessingTask } from './TaskProcessing'
import { CavesMask, EmptyChunk, GroundChunk } from '../factory/ChunksFactory'
const chunksRange = WorldEnv.current.chunks.range
const patchDims = WorldEnv.current.patchDimensions

enum ChunksGenSide {
  Lower,
  Upper,
}

export type ChunksProcessingParams = {
  skipChunksEncoding?: boolean,
  genSide?: ChunksGenSide
}

export const lowerChunksProcessingParams: ChunksProcessingParams = {
  genSide: ChunksGenSide.Lower
}

export const upperChunksProcessingParams: ChunksProcessingParams = {
  genSide: ChunksGenSide.Upper
}

/**
 * on-the-fly chunks processing
 * 2 rules of thumb:
 * - ground surface chunks always precedes underground chunks because view distance
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 */
export class ChunkSet extends ProcessingTask {
  // static history: Record<PatchKey, number> = {}
  patchKey: PatchKey

  constructor(patchKey: PatchKey) {
    super()
    this.patchKey = patchKey
  }

  get patchId() {
    return parsePatchKey(this.patchKey) as Vector2
  }

  get patchBounds() {
    return asPatchBounds(this.patchKey, patchDims)
  }

  get patchCenter() {
    return this.patchBounds.getCenter(new Vector2())
  }

  distanceTo(pos: Vector2) {
    return this.patchId.distanceTo(pos)
    // return this.patchCenter.distanceTo(pos)
  }

  get chunkIds() {
    const chunksIds = []
    const { bottomId, topId } = chunksRange
    for (let y = topId; y >= bottomId; y--) {
      const chunkId = asVect3(this.patchId, y)
      chunksIds.push(chunkId)
    }
    return chunksIds
  }

  printChunkset = (chunkset: ChunkContainer[]) =>
    chunkset.reduce((concat, chunk) => concat + chunk.chunkKey + ', ', '')

  override get inputs() {
    return ([this.patchKey])
  }

  // override cancelPendingTask() {
  //   const canceled = super.cancelPendingTask()
  //   if (canceled) {
  //     console.log(`canceled pending task ${this.patchKey}`)
  //   }
  //   return canceled
  // }

  override reconcile(stubs: ChunkStub[]) {
    // ChunkSet.history[this.patchKey] = ChunkSet.history[this.patchKey] || 0
    // ChunkSet.history[this.patchKey]++
    const chunks = stubs.map(stub => ChunkContainer.fromStub(stub))
    return chunks
  }

  override async process(processingParams: ChunksProcessingParams) {
    this.processingState = ProcessingState.Pending
    const { skipChunksEncoding, genSide } = processingParams
    const lowerGen = genSide === undefined || genSide === ChunksGenSide.Lower
    const upperGen = genSide === undefined || genSide === ChunksGenSide.Upper
    const lowerChunks = lowerGen ? await this.lowerChunksGen(skipChunksEncoding) : []
    const upperChunks = upperGen ? await this.upperChunksGen() : []
    this.processingState = ProcessingState.Done
    return [...lowerChunks, ...upperChunks]
  }

  /**
   * Chunks above ground surface including overground items & empty chunks
   */
  async upperChunksGen() {
    const itemsLayer = new ItemsChunkLayer(this.patchKey)
    await itemsLayer.process()
    const itemsMergedChunk = itemsLayer.mergeIndividualChunks()
    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const patchId = groundLayer.patchId as PatchId
    const upperChunks: ChunkContainer[] = []
    // compute chunk id range
    const { patchDimensions } = WorldEnv.current
    const yMin = Math.min(
      itemsMergedChunk.bounds.min.y,
      groundLayer.valueRange.min,
    )
    const yMax = Math.max(
      itemsMergedChunk.bounds.max.y,
      groundLayer.valueRange.max,
    )
    const surfaceIds = {
      yMinId: Math.floor(yMin / patchDimensions.y),
      yMaxId: Math.floor(yMax / patchDimensions.y),
    }

    // gen each surface chunk in range
    for (let yId = surfaceIds.yMinId; yId <= surfaceIds.yMaxId; yId++) {
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const worldChunk = new ChunkContainer(chunkKey, 1)
      // copy items layer first to prevent overriding ground
      ChunkContainer.copySourceToTarget(itemsMergedChunk, worldChunk)
      if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
        // bake ground and undeground separately
        const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
        const cavesMask = new CavesMask(chunkKey, 1)
        cavesMask.bake()
        await groundSurfaceChunk.bake(groundLayer, cavesMask)
        // copy ground over items at last
        ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
      }
      upperChunks.push(worldChunk)
      // remaining chunks

      // console.log(
      //   `processed surface chunks: ${this.printChunkset(groundSurfaceChunks)}`,
      // )
      // empty chunks start 1 chunk above ground surface
      for (let y = surfaceIds.yMaxId + 1; y <= chunksRange.topId; y++) {
        const chunkId = asVect3(this.patchId, y)
        const chunkKey = serializeChunkId(chunkId)
        const emptyChunk = new EmptyChunk(chunkKey)
        upperChunks.push(emptyChunk)
      }
      // console.log(`processed empty chunks: ${this.printChunkset(emptyChunks)}`)
    }
    return upperChunks
  }

  /**
   * Chunks below ground surface
   */
  async lowerChunksGen(skipEncoding = false) {
    // find upper chunkId
    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const upperId =
      Math.floor(
        groundLayer.valueRange.min / WorldEnv.current.patchDimensions.y,
      ) //- 1
    const lowerChunks = []
    // then iter until bottom is reached
    for (let yId = upperId; yId >= chunksRange.bottomId; yId--) {
      const chunkId = asVect3(this.patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const currentChunk = new ChunkContainer(chunkKey, 1)
      const customEncoder = skipEncoding ? defaultDataEncoder : undefined
      const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
      const cavesMask = new CavesMask(chunkKey, 1)
      cavesMask.bake()
      await groundSurfaceChunk.bake(groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, currentChunk)
      lowerChunks.push(currentChunk)
    }
    // console.log(
    //   `processed undeground chunkset: ${this.printChunkset(undergoundChunks)}`,
    // )
    this.processingState = ProcessingState.Done
    return lowerChunks
  }

  /**
   * Sequential chunk gen
   */
  // async *sequentialGen(chunkKeys: ChunkKey[]) {
  //     for (const chunkKey of chunkKeys) {
  //         const worldChunk = await WorldComputeProxy.current.bakeWorldChunk(chunkKey)
  //         yield worldChunk
  //     }
  // }
}

ProcessingTask.registeredObjects[ChunkSet.name] = ChunkSet