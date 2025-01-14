import { Vector2 } from 'three'

import { WorldEnv } from '../config/WorldEnv'
import {
  parsePatchKey,
  asVect3,
  serializeChunkId,
  asPatchBounds,
} from '../utils/convert'
import { ChunkIndex, PatchId, PatchKey } from '../utils/types'
import {
  ChunkContainer,
  ChunkStub,
  defaultDataEncoder,
} from '../datacontainers/ChunkContainer'
import { CavesMask, EmptyChunk, GroundChunk } from '../factory/ChunksFactory'

import { GroundPatch } from './GroundPatch'
import { ProcessingState, ProcessingTask } from './TaskProcessing'
import { ItemsBaker } from './ItemsProcessing'
const chunksRange = WorldEnv.current.chunks.range
const { patchDimensions: patchDims } = WorldEnv.current

enum ChunksGenSide {
  Lower,
  Upper,
}

export type ChunksProcessingParams = {
  noDataEncoding?: boolean
  skipEntities?: boolean
  genSide?: ChunksGenSide
}

export const lowerChunksProcessingParams: ChunksProcessingParams = {
  genSide: ChunksGenSide.Lower,
}

export const upperChunksProcessingParams: ChunksProcessingParams = {
  genSide: ChunksGenSide.Upper,
}

/**
 * on-the-fly chunks processing
 * 2 rules of thumb:
 * - ground surface chunks always precedes underground chunks because view distance
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 */
export class ChunksProcessor extends ProcessingTask {
  // static history: Record<PatchKey, number> = {}
  patchKey: PatchKey
  chunksIndex: ChunkIndex<ChunkContainer> = {}

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
    return [this.patchKey]
  }

  // override cancelPendingTask() {
  //   const canceled = super.cancelPendingTask()
  //   if (canceled) {
  //     console.log(`canceled pending task ${this.patchKey}`)
  //   }
  //   return canceled
  // }

  override reconcile(stubs: ChunkStub[]) {
    // ChunksProcessor.history[this.patchKey] = ChunksProcessor.history[this.patchKey] || 0
    // ChunksProcessor.history[this.patchKey]++
    const chunks = stubs.map(stub => ChunkContainer.fromStub(stub))
    return chunks
  }

  override async process(processingParams: ChunksProcessingParams) {
    this.processingState = ProcessingState.Pending
    this.processingParams = processingParams
    const { noDataEncoding, genSide } = processingParams
    const lowerGen = genSide === undefined || genSide === ChunksGenSide.Lower
    const upperGen = genSide === undefined || genSide === ChunksGenSide.Upper
    const lowerChunks = lowerGen
      ? await this.lowerChunksGen(noDataEncoding)
      : []
    const upperChunks = upperGen
      ? await this.upperChunksGen(noDataEncoding)
      : []
    this.processingState = ProcessingState.Done

    const chunks = [...lowerChunks, ...upperChunks]
    return chunks
  }

  /**
   * Chunks above ground surface including overground items & empty chunks
   */
  async upperChunksGen(noDataEncoding = false) {
    const { skipEntities } = this.processingParams as ChunksProcessingParams

    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const patchId = groundLayer.patchId as PatchId
    const upperChunks: ChunkContainer[] = []
    // compute chunk id range
    let yMin = groundLayer.valueRange.min
    let yMax = groundLayer.valueRange.max

    let mergedItemsChunk
    if (!skipEntities) {
      const itemsLayer = new ItemsBaker(this.patchKey)
      mergedItemsChunk = await itemsLayer.mergeIndividualChunks()
      // adjust chunks range accordingly
      yMin = Math.min(mergedItemsChunk.bounds.min.y, yMin)
      yMax = Math.max(mergedItemsChunk.bounds.max.y, yMax)
    }

    const surfaceIds = {
      yMinId: Math.floor(yMin / patchDims.y),
      yMaxId: Math.floor(yMax / patchDims.y),
    }

    // gen each surface chunk in range
    for (let yId = surfaceIds.yMinId; yId <= surfaceIds.yMaxId; yId++) {
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const worldChunk = new ChunkContainer(chunkKey, 1)
      // copy items layer first to prevent overriding ground
      mergedItemsChunk &&
        ChunkContainer.copySourceToTarget(mergedItemsChunk, worldChunk)
      if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
        // bake ground and undeground separately
        const customEncoder = noDataEncoding ? defaultDataEncoder : undefined
        const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
        const cavesMask = new CavesMask(chunkKey, 1)
        cavesMask.bake()
        await groundSurfaceChunk.bake(groundLayer, cavesMask)
        // copy ground over items at last
        ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
      }
      upperChunks.push(worldChunk)
    }

    // remaining chunks: empty chunks start 1 chunk above ground surface
    for (let y = surfaceIds.yMaxId + 1; y <= chunksRange.topId; y++) {
      const chunkId = asVect3(this.patchId, y)
      const chunkKey = serializeChunkId(chunkId)
      const emptyChunk = new EmptyChunk(chunkKey)
      upperChunks.push(emptyChunk)
    }
    return upperChunks
  }

  /**
   * Chunks below ground surface
   */
  async lowerChunksGen(noDataEncoding = false) {
    // find upper chunkId
    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const upperId = Math.floor(groundLayer.valueRange.min / patchDims.y) - 1
    const lowerChunks = []
    // then iter until bottom is reached
    for (let yId = upperId; yId >= chunksRange.bottomId; yId--) {
      const chunkId = asVect3(this.patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const currentChunk = new ChunkContainer(chunkKey, 1)
      const customEncoder = noDataEncoding ? defaultDataEncoder : undefined
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

  // individualChunkGen(chunkKey: ChunkKey){

  // }

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

ProcessingTask.registeredObjects[ChunksProcessor.name] = ChunksProcessor
