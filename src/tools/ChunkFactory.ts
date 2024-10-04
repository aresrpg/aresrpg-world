import { Box3, MathUtils, Vector3 } from 'three'

import { PatchId } from '../common/types'
import {
  asVect2,
  asVect3,
  chunkBoxFromId,
  parseThreeStub,
  serializeChunkId,
} from '../common/utils'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { OvergroundEntities, WorldItem } from '../datacontainers/OvergroundEntities'
import { BlockMode, BlockType, GroundPatch, WorldConf } from '../index'

// for debug use only
const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return WorldConf.debug.patch.borderHighlightColor &&
    (localPos.x === 1 || localPos.z === 1)
    ? WorldConf.debug.patch.borderHighlightColor
    : blockType
}

export class ChunkFactory {
  // eslint-disable-next-line no-use-before-define
  static defaultInstance: ChunkFactory
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  voxelDataEncoder = (blockType: BlockType, _blockMode?: BlockMode) =>
    blockType || BlockType.NONE

  chunksRange = {
    ymin: 0,
    ymax: 5,
  }

  static get default() {
    this.defaultInstance = this.defaultInstance || new ChunkFactory()
    return this.defaultInstance
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
  chunkifyPatch(groundLayer: GroundPatch, overgroundItems: Record<WorldItem, Vector3[]>) {
    const patchChunkIds = groundLayer.id
      ? ChunkFactory.default.genChunksIdsFromPatchId(groundLayer.id)
      : []
    const worldChunksStubs = patchChunkIds.map(chunkId => {
      const chunkBox = chunkBoxFromId(chunkId, WorldConf.patchSize)
      const worldChunk = new ChunkContainer(chunkBox)
      // this.mergePatchLayersToChunk(worldChunk, groundLayer, overgroundItems)
      // merge items first so they don't override ground
      this.mergeOvergroundItems(worldChunk, overgroundItems)
      // merge ground layer after, overriding items blocks overlapping with ground
      this.mergeGroundLayer(worldChunk, groundLayer)
      const worldChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.rawData,
      }
      return worldChunkStub
    })
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
        const bufferData = this.voxelDataEncoder(
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

  mergeOvergroundItems(worldChunk: ChunkContainer, overgroundItems: Record<WorldItem, Vector3[]>) {
    Object.entries(overgroundItems).forEach(([type, spawnPlaces]) => {
      const itemType = parseInt(type) as WorldItem
      const { entity } = OvergroundEntities.registered[itemType]
      spawnPlaces.forEach(spawnLoc => {
        const dims = entity.template.bounds.getSize(new Vector3())
        // const translation = parseThreeStub(spawnLoc).sub(new Vector3(dims.x / 2, 0, dims.z / 2).round())
        // const entityBounds = entity.template.bounds.clone().translate(translation)
        const entityBounds = new Box3().setFromCenterAndSize(spawnLoc, dims)
        entityBounds.min.y = spawnLoc.y
        entityBounds.max.y = spawnLoc.y + dims.y
        entityBounds.min.floor()
        entityBounds.max.floor()
        const entityChunk = new ChunkContainer(entityBounds, 0)
        entityChunk.rawData.set(entity.template.rawData)
        ChunkContainer.copySourceToTarget(entityChunk, worldChunk)
      })
    })
  }
}
