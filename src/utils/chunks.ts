import { MathUtils, Vector3 } from 'three'

import { PatchId } from './types'
import {
  asVect2,
  asVect3,
  serializeChunkId,
} from './common'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { parseGroundFlags } from '../datacontainers/GroundPatch'
import { Biome, BiomeType, BlockMode, BlockType, GroundPatch, WorldConf } from '../index'

const UNDERGROUND_DEPTH = 4
// for debug use only
export const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return WorldConf.instance.debug.patch.borderHighlightColor &&
    (localPos.x === 1 || localPos.z === 1)
    ? WorldConf.instance.debug.patch.borderHighlightColor
    : blockType
}

export const genChunksIdsFromPatchId = (patchId: PatchId) => {
  const { ymin, ymax } = WorldConf.instance.chunkSettings.verticalRange
    const chunk_ids = []
    for (let y = ymax; y >= ymin; y--) {
      const chunk_coords = asVect3(patchId, y)
      chunk_ids.push(chunk_coords)
    }
    return chunk_ids
  }

export const getWorldChunksFromPatchId = (patchId: PatchId) => {
  const patchChunkIds = genChunksIdsFromPatchId(patchId)
  // const worldChunksStubs = patchChunkIds.map(async chunkId => {
  const worldChunks = patchChunkIds.map(chunkId => new ChunkContainer(serializeChunkId(chunkId), 1))
  return worldChunks
  // const worldChunksStubs = patchChunkIds.map(chunkId => {

  // this.mergePatchLayersToChunk(worldChunk, groundLayer, overgroundItems)
  // merge chunk items first so they don't override ground
  // for (const chunkItem of chunkItems) {
  //   ChunkContainer.copySourceToTarget(chunkItem, worldChunk)
  // }
  // merge ground layer after, overriding items blocks overlapping with ground
  // this.mergeGroundLayer(worldChunk, groundLayer)
  //   const worldChunkStub = {
  //     key: serializeChunkId(chunkId),
  //     data: worldChunk.rawData,
  //   }
  //   return worldChunkStub
  // })
  // return worldChunksStubs
}

  /**
   * Assembles pieces together: ground surface, underground layer, caverns, overground items
   */
  export const chunkifyPatch = (groundLayer: GroundPatch, chunkItems: ChunkContainer[], chunkMask: ChunkContainer) => {
    const patchChunkIds = groundLayer.id
    ? genChunksIdsFromPatchId(groundLayer.id)
      : []
    // const worldChunksStubs = patchChunkIds.map(async chunkId => {
    const worldChunksStubs = patchChunkIds.map(chunkId => {
    const worldChunk = new ChunkContainer(serializeChunkId(chunkId))
      // this.mergePatchLayersToChunk(worldChunk, groundLayer, overgroundItems)
      // merge chunk items first so they don't override ground
      for (const chunkItem of chunkItems) {
        ChunkContainer.copySourceToTarget(chunkItem, worldChunk)
      }
      const intermediateChunk = new ChunkContainer(serializeChunkId(chunkId), 1)
      // merge ground surface and underground cavern layers separately, 
      mergeGroundLayer(intermediateChunk, groundLayer)
      // apply caves masking chunk
      ChunkContainer.applyMaskOnTarget(chunkMask, intermediateChunk)
      // merge ground in final chunk containing items (will override overlapping items' blocks)
      ChunkContainer.copySourceToTarget(intermediateChunk, worldChunk)
      const finalChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.rawData,
      }
      return finalChunkStub
    })
    return worldChunksStubs
  }

  export const mergeGroundLayer = (worldChunk: ChunkContainer, groundLayer: GroundPatch) => {
    const ymin = worldChunk.extendedBounds.min.y
    const ymax = worldChunk.extendedBounds.max.y
    const blocks = groundLayer.iterBlocksQuery(undefined, false)
    const bedrock = ChunkContainer.defaultDataEncoder(BlockType.BEDROCK)
    const bedrock_ice = ChunkContainer.defaultDataEncoder(BlockType.ICE)
    for (const block of blocks) {
      const blockLocalPos = block.localPos as Vector3
      // blockLocalPos.x += 1
      // block.localPos.y = patch.bbox.max.y
      // blockLocalPos.z += 1
      const { biome, landscapeIndex, flags } = block.data
      let landscapeConf = Biome.instance.mappings[biome].nth(landscapeIndex)
      const groundConf = landscapeConf.data
      const groundFlags = parseGroundFlags(flags)
      const blockType = highlightPatchBorders(blockLocalPos, groundConf.type) || groundConf.type
      const blockMode = groundFlags.boardMode ? BlockMode.BOARD_CONTAINER : BlockMode.DEFAULT
      const groundSurface = ChunkContainer.defaultDataEncoder(
        blockType,
        blockMode
      )
      const undergroundLayer = ChunkContainer.defaultDataEncoder(groundConf.subtype || BlockType.BEDROCK)
      // generate ground buffer
      const buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
      if (buffSize > 0) {
        const groundBuffer = new Uint16Array(block.data.level - ymin)
        // fill with bedrock first
        groundBuffer.fill(biome === BiomeType.Artic ? bedrock_ice : bedrock)
        // add underground layer
        groundBuffer.fill(undergroundLayer, groundBuffer.length - (UNDERGROUND_DEPTH + 1))
        // finish with ground surface block
        groundBuffer[groundBuffer.length - 1] = groundSurface
        // worldChunk.writeSector()
        const chunkBuffer = worldChunk.readBuffer(asVect2(blockLocalPos))
        chunkBuffer.set(groundBuffer.slice(0, buffSize))
        worldChunk.writeBuffer(asVect2(blockLocalPos), chunkBuffer)
      }
    }
  }
