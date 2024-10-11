import { Box3, MathUtils, Vector3 } from 'three'

import { PatchId } from '../common/types'
import {
  asVect2,
  asVect3,
  chunkBoxFromId,
  serializeChunkId,
} from '../common/utils'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { BlockMode, BlockType, GroundPatch, ItemsInventory, WorldConf } from '../index'
import { ItemType } from '../misc/ItemsInventory'

// for debug use only
const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return WorldConf.debug.patch.borderHighlightColor &&
    (localPos.x === 1 || localPos.z === 1)
    ? WorldConf.debug.patch.borderHighlightColor
    : blockType
}

export class ChunkFactory {
  // eslint-disable-next-line no-use-before-define
  static instance: ChunkFactory
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chunkDataEncoder = (blockType: BlockType, _blockMode?: BlockMode) =>
    blockType || BlockType.NONE

  chunksRange = {
    ymin: 0,
    ymax: 5,
  }

  static get default() {
    this.instance = this.instance || new ChunkFactory()
    return this.instance
  }

  setChunksGenRange(ymin: number, ymax: number) {
    this.chunksRange.ymin = ymin
    this.chunksRange.ymax = ymax
  }

  genChunksIdsFromPatchId(patchId: PatchId) {
    const { ymin, ymax } = this.chunksRange
    const chunk_ids = []
    for (let y = ymax; y >= ymin; y--) {
      const chunk_coords = asVect3(patchId, y)
      chunk_ids.push(chunk_coords)
    }
    return chunk_ids
  }

  /**
   * Assembles pieces together: ground, world objects
   */
  async chunkifyPatch(groundLayer: GroundPatch, overgroundItems: Record<ItemType, Vector3[]>) {
    const patchChunkIds = groundLayer.id
      ? ChunkFactory.default.genChunksIdsFromPatchId(groundLayer.id)
      : []
    // const worldChunksStubs = patchChunkIds.map(async chunkId => {
    const worldChunksStubs = await Promise.all(patchChunkIds.map(async chunkId => {
      const chunkBox = chunkBoxFromId(chunkId, WorldConf.patchSize)
      const worldChunk = new ChunkContainer(chunkBox)
      // this.mergePatchLayersToChunk(worldChunk, groundLayer, overgroundItems)
      // merge items first so they don't override ground
      await this.mergeOvergroundItems(worldChunk, overgroundItems)
      // merge ground layer after, overriding items blocks overlapping with ground
      this.mergeGroundLayer(worldChunk, groundLayer)
      const worldChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.rawData,
      }
      return worldChunkStub
    }))
    return worldChunksStubs
  }

  mergeGroundLayer(worldChunk: ChunkContainer, groundLayer: GroundPatch) {
    const ymin = worldChunk.bounds.min.y
    const ymax = worldChunk.bounds.max.y
    const blocks = groundLayer.iterBlocksQuery(undefined, false)
    for (const block of blocks) {
      const blockLocalPos = block.localPos as Vector3
      blockLocalPos.x += 1
      // block.localPos.y = patch.bbox.max.y
      blockLocalPos.z += 1
      const blockType = highlightPatchBorders(blockLocalPos, block.data.type) || block.data.type
      const blockMode = block.data.mode
      // generate ground buffer
      let buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
      if (buffSize > 0) {
        const groundBuffer = new Uint16Array(buffSize)
        const bufferData = this.chunkDataEncoder(
          blockType,
          blockMode,
        )
        groundBuffer.fill(bufferData)
        // worldChunk.writeSector()
        const chunkBuffer = worldChunk.readBuffer(asVect2(blockLocalPos))
        chunkBuffer.set(groundBuffer)
        worldChunk.writeBuffer(asVect2(blockLocalPos), chunkBuffer)
      }
    }
  }

  async mergeOvergroundItems(worldChunk: ChunkContainer, overgroundItems: Record<ItemType, Vector3[]>) {
    // Object.entries(overgroundItems).forEach(([itemType, spawnPlaces]) => {
    const entries = Object.entries(overgroundItems)
    for await (const [itemType, spawnPlaces] of entries) {
      const itemChunk = await ItemsInventory.getItem(itemType)
      if (itemChunk) {
        spawnPlaces.forEach(spawnLoc => {
          const dims = itemChunk.bounds.getSize(new Vector3())
          // const translation = parseThreeStub(spawnLoc).sub(new Vector3(dims.x / 2, 0, dims.z / 2).round())
          // const entityBounds = entity.template.bounds.clone().translate(translation)
          const entityBounds = new Box3().setFromCenterAndSize(spawnLoc, dims)
          entityBounds.min.y = spawnLoc.y
          entityBounds.max.y = spawnLoc.y + dims.y
          entityBounds.min.floor()
          entityBounds.max.floor()
          const entityChunk = new ChunkContainer(entityBounds, 0)
          entityChunk.rawData.set(itemChunk.rawData)
          ChunkContainer.copySourceToTarget(entityChunk, worldChunk)
        })
      }
    }//)
  }
}
