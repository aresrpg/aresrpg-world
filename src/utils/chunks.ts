import { MathUtils, Vector3 } from 'three'

import { PatchId } from './types'
import {
  asVect2,
  asVect3,
  serializeChunkId,
} from './common'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { BlockMode, BlockType, GroundPatch, WorldConf } from '../index'

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
   * Assembles pieces together: ground, world objects
   */
export const chunkifyPatch = (groundLayer: GroundPatch, chunkItems: ChunkContainer[]) => {
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
    // merge ground layer after, overriding items blocks overlapping with ground
    mergeGroundLayer(worldChunk, groundLayer)
    const worldChunkStub = {
      key: serializeChunkId(chunkId),
      data: worldChunk.rawData,
    }
    return worldChunk//worldChunkStub
  })
  return worldChunksStubs
}

export const mergeGroundLayer = (worldChunk: ChunkContainer, groundLayer: GroundPatch) => {
  const ymin = worldChunk.extendedBounds.min.y
  const ymax = worldChunk.extendedBounds.max.y
  const blocks = groundLayer.iterBlocksQuery(undefined, false)
  for (const block of blocks) {
    const blockLocalPos = block.localPos as Vector3
    // blockLocalPos.x += 1
    // block.localPos.y = patch.bbox.max.y
    // blockLocalPos.z += 1
    const blockType =
      highlightPatchBorders(blockLocalPos, block.data.type) || block.data.type
    const blockMode = block.data.mode
    // generate ground buffer
    const buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
    if (buffSize > 0) {
      const groundBuffer = new Uint16Array(buffSize)
      const encodedData = ChunkContainer.defaultDataEncoder(blockType, blockMode)
      groundBuffer.fill(encodedData)
      // worldChunk.writeSector()
      const chunkBuffer = worldChunk.readBuffer(asVect2(blockLocalPos))
      chunkBuffer.set(groundBuffer)
      worldChunk.writeBuffer(asVect2(blockLocalPos), chunkBuffer)
    }
  }
}
