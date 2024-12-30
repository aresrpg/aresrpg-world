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
import { EmptyChunk, GroundChunk } from './ChunkFactory'
import { bakeCavesMask } from '../api/world-compute'
import { GroundPatch } from './GroundPatch'
import { ItemsChunkLayer } from './ItemsInventory'
import { ProcessingState, WorldProcessing } from './WorldProcessing'
const chunksRange = WorldEnv.current.chunks.range
const patchDims = WorldEnv.current.patchDimensions



/**
 * on-the-fly chunks processing
 * 2 rules of thumb:
 * - ground surface chunks always precedes underground chunks because view distance
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 */
export class ChunkSet extends WorldProcessing {
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
    return this.patchCenter.distanceTo(pos)
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

  override cancelPendingTask() {
    const canceled = super.cancelPendingTask()
    if (canceled) {
      console.log(`canceled pending task ${this.patchKey}`)
    }
    return canceled
  }
  
  override reconcile(stubs: ChunkStub[]) {
    const chunks = stubs.map(stub => ChunkContainer.fromStub(stub))
    return chunks
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

/**
 * chunks above ground surface including overground items & empty chunks
 */
export class GroundSurfaceChunkset extends ChunkSet {

  override async process(processingParams: any) {
    super.process(processingParams)
    const groundSurfaceChunks = await this.bake()
    const lastSurfaceIndex = groundSurfaceChunks.length - 1
    const surfaceRange = {
      bottom: groundSurfaceChunks[0]?.chunkId?.y || 0,
      top: groundSurfaceChunks[lastSurfaceIndex]?.chunkId?.y || 0,
    }
    // console.log(
    //   `processed surface chunks: ${this.printChunkset(groundSurfaceChunks)}`,
    // )
    // empty chunks start 1 chunk above ground surface
    const emptyChunks = []
    for (let y = surfaceRange.top + 1; y <= chunksRange.topId; y++) {
      const chunkId = asVect3(this.patchId, y)
      const chunkKey = serializeChunkId(chunkId)
      const emptyChunk = new EmptyChunk(chunkKey)
      emptyChunks.push(emptyChunk)
    }
    // console.log(`processed empty chunks: ${this.printChunkset(emptyChunks)}`)
    this.processingState = ProcessingState.Done
    return [...groundSurfaceChunks, ...emptyChunks]
  }

  async bake() {
    const itemsLayer = new ItemsChunkLayer(this.patchKey)
    await itemsLayer.process()
    const itemsMergedChunk = itemsLayer.mergeIndividualChunks()
    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const patchId = groundLayer.patchId as PatchId
    const surfaceChunks: ChunkContainer[] = []
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
    const yMinId = Math.floor(yMin / patchDimensions.y)
    const yMaxId = Math.floor(yMax / patchDimensions.y)
    // gen each surface chunk in range
    for (let yId = yMinId; yId <= yMaxId; yId++) {
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const worldChunk = new ChunkContainer(chunkKey, 1)
      // copy items layer first to prevent overriding ground
      ChunkContainer.copySourceToTarget(itemsMergedChunk, worldChunk)
      if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
        // bake ground and undeground separately
        const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
        const cavesMask = await bakeCavesMask(chunkKey)
        await groundSurfaceChunk.bake(groundLayer, cavesMask)
        // copy ground over items at last
        ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
      }
      surfaceChunks.push(worldChunk)
    }
    return surfaceChunks
  }
}

// register
WorldProcessing.registeredObjects[GroundSurfaceChunkset.name] = GroundSurfaceChunkset

/**
 * chunks below ground surface
 */
export class UndegroundChunkset extends ChunkSet {

  override async process(processingParams = { skipEncoding: false }) {
    super.process(processingParams)
    const { skipEncoding } = processingParams
    // find upper chunkId
    const groundLayer = new GroundPatch(this.patchKey)
    groundLayer.bake()
    const upperId =
      Math.floor(
        groundLayer.valueRange.min / WorldEnv.current.patchDimensions.y,
      ) //- 1
    const undergroundChunks = []
    // then iter until bottom is reached
    for (let yId = upperId; yId >= chunksRange.bottomId; yId--) {
      const chunkId = asVect3(this.patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const currentChunk = new ChunkContainer(chunkKey, 1)
      const customEncoder = skipEncoding ? defaultDataEncoder : undefined
      const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
      const cavesMask = await bakeCavesMask(chunkKey)
      await groundSurfaceChunk.bake(groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, currentChunk)
      undergroundChunks.push(currentChunk)
    }
    // console.log(
    //   `processed undeground chunkset: ${this.printChunkset(undergoundChunks)}`,
    // )
    this.processingState = ProcessingState.Done
    return undergroundChunks
  }
}

// register
WorldProcessing.registeredObjects[UndegroundChunkset.name] = UndegroundChunkset
