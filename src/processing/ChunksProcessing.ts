import { Box3, MathUtils, Vector2, Vector3 } from 'three'

import { WorldEnv } from '../config/WorldEnv'
import {
  parsePatchKey,
  asVect3,
  serializeChunkId,
  asPatchBounds,
  asVect2,
  serializePatchId,
  asBox2,
} from '../utils/convert'
import { BlockMode, ChunkKey, PatchBlock, PatchId, PatchKey } from '../utils/types'

import { ChunkBuffer, ChunkContainer, ChunkMask, ChunkStub, defaultDataEncoder } from '../datacontainers/ChunkContainer'
import { GroundPatch, parseGroundFlags } from './GroundPatch'
import { ItemsChunkLayer } from './ItemsProcessing'
import { ProcessingState, WorldProcessing } from './WorldProcessing'
import { BlockType, Biome, BiomeType, DensityVolume } from '../index'
const chunksRange = WorldEnv.current.chunks.range
const patchDims = WorldEnv.current.patchDimensions


export class EmptyChunk extends ChunkContainer {
  constructor(chunkKey: ChunkKey) {
    super(chunkKey, 1)
    this.rawData = new Uint16Array()
  }

  async bake() {}
}

const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return WorldEnv.current.debug.patch.borderHighlightColor &&
    (localPos.x === 1 || localPos.z === 1)
    ? WorldEnv.current.debug.patch.borderHighlightColor
    : blockType
}

export class GroundChunk extends ChunkContainer {
  generateGroundBuffer(block: PatchBlock, ymin: number, ymax: number) {
    const undegroundDepth = 4
    const bedrock = this.dataEncoder(BlockType.BEDROCK)
    const bedrockIce = this.dataEncoder(BlockType.ICE)
    const { biome, landscapeIndex, flags } = block.data
    const blockLocalPos = block.localPos as Vector3
    const landscapeConf = Biome.instance.mappings[biome].nth(landscapeIndex)
    const groundConf = landscapeConf.data
    const groundFlags = parseGroundFlags(flags)
    const blockType =
      highlightPatchBorders(blockLocalPos, groundConf.type) || groundConf.type
    const blockMode = groundFlags.boardMode
      ? BlockMode.CHECKERBOARD
      : BlockMode.REGULAR
    const groundSurface = this.dataEncoder(blockType, blockMode)
    const undergroundLayer = this.dataEncoder(
      groundConf.subtype || BlockType.BEDROCK,
    )
    // generate ground buffer
    const buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
    if (buffSize > 0) {
      const groundBuffer = new Uint16Array(block.data.level - ymin)
      // fill with bedrock first
      groundBuffer.fill(biome === BiomeType.Arctic ? bedrockIce : bedrock)
      // add underground layer
      groundBuffer.fill(
        undergroundLayer,
        groundBuffer.length - (undegroundDepth + 1),
      )
      // finish with ground surface block
      groundBuffer[groundBuffer.length - 1] = groundSurface
      const chunkBuffer: ChunkBuffer = {
        pos: asVect2(blockLocalPos),
        content: groundBuffer.slice(0, buffSize),
      }
      return chunkBuffer
    }
    return undefined
  }

  async bake(groundLayer?: GroundPatch, cavesMask?: ChunkMask) {
    const patchId = asVect2(this.chunkId as Vector3)
    const patchKey = serializePatchId(patchId)
    groundLayer = groundLayer || new GroundPatch(patchKey)
    groundLayer.isEmpty && (await groundLayer.bake())

    const ymin = this.extendedBounds.min.y
    const ymax = this.extendedBounds.max.y

    const blocks = groundLayer.iterBlocksQuery(undefined, false)
    for (const block of blocks) {
      const groundBuff = this.generateGroundBuffer(block, ymin, ymax)
      if (groundBuff) {
        const chunk_buffer = this.readBuffer(groundBuff.pos)
        chunk_buffer.set(groundBuff.content)
        this.writeBuffer(groundBuff.pos, chunk_buffer)
      }
    }

    cavesMask?.applyMaskOnTargetChunk(this)
  }
}

/**
 * Underground chunk (caverns)
 */

export const bakeCavesMask = (boundsOrPatchKey: ChunkKey | Box3) => {
  const chunkContainer = new ChunkMask(boundsOrPatchKey, 1)
  const chunkBounds = chunkContainer.bounds
  const groundLayer = new GroundPatch(asBox2(chunkBounds))
  groundLayer.bake()
  // const bounds = asBox3(groundLayer.bounds)
  // bounds.max.y = groundLayer.valueRange.max
  // const chunkContainer = new ChunkContainer(bounds, 1)
  // chunkContainer.rawData.fill(0)
  const patchIter = groundLayer.iterBlocksQuery(undefined, false)
  for (const block of patchIter) {
    // const buffPos = asVect2(block.localPos)
    // const chunkBuff = chunkContainer.readBuffer(buffPos)
    const groundLevel = block.pos.y
    const ymin = chunkContainer.extendedBounds.min.y
    const ymax = Math.min(groundLevel, chunkContainer.extendedBounds.max.y)
    const startLocalPos = new Vector3(block.localPos.x, -1, block.localPos.z)
    let startIndex = chunkContainer.getIndex(startLocalPos)
    for (let y = ymin; y <= ymax; y++) {
      block.pos.y = y
      const isEmptyBlock = DensityVolume.instance.getBlockDensity(
        block.pos,
        groundLevel + 20,
      )
      chunkContainer.rawData[startIndex++] = isEmptyBlock ? 0 : 1
    }
    // chunkContainer.writeBuffer(buffPos, chunkBuff)
  }
  // const chunkIter = chunkContainer.iterateContent(undefined, false)
  // for (const block of chunkIter) {
  //   const isEmptyBlock = DensityVolume.instance.getBlockType(block.pos, bounds.max.y) === BlockType.NONE
  //   chunkContainer.writeSector(block.pos, isEmptyBlock ? 0 : 1)
  // }
  return chunkContainer
}


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
