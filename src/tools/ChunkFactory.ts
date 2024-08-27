import { Box3, MathUtils, Vector3 } from 'three'

import { Block, PatchId } from '../common/types'
import { asVect3 } from '../common/utils'
import { BlockData } from '../data/DataContainers'
import { BlockMode, BlockType } from '../index'

const DBG_BORDERS_HIGHLIGHT_COLOR = BlockType.NONE // disabled if NONE

// for debug use only
const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return DBG_BORDERS_HIGHLIGHT_COLOR && (localPos.x === 1 || localPos.z === 1)
    ? DBG_BORDERS_HIGHLIGHT_COLOR
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

  writeChunkBlocks(
    chunkDataContainer: Uint16Array,
    chunkBbox: Box3,
    blockLocalPos: Vector3,
    blockData: BlockData,
    bufferOver: any[] = [],
  ) {
    const chunk_size = chunkBbox.getSize(new Vector3()).x // Math.round(Math.pow(chunkDataContainer.length, 1 / 3))

    let written_blocks_count = 0

    const level = MathUtils.clamp(
      blockLocalPos.y + bufferOver.length,
      chunkBbox.min.y,
      chunkBbox.max.y,
    )
    let buff_index = Math.max(level - blockLocalPos.y, 0)
    let h = level - chunkBbox.min.y // local height
    // debug_mode && is_edge(local_pos.z, local_pos.x, h, patch_size - 2)
    //   ? BlockType.SAND
    //   : block_cache.type

    while (h >= 0) {
      const blocksIndex =
        blockLocalPos.z * Math.pow(chunk_size, 2) +
        h * chunk_size +
        blockLocalPos.x
      const blockType = buff_index > 0 ? bufferOver[buff_index] : blockData.type
      const skip =
        buff_index > 0 &&
        chunkDataContainer[blocksIndex] !== undefined &&
        !bufferOver[buff_index]
      if (!skip) {
        chunkDataContainer[blocksIndex] = this.voxelDataEncoder(
          blockType,
          blockData.mode,
        )
        blockType && written_blocks_count++
      }
      buff_index--
      h--
    }
    return written_blocks_count
  }

  fillGroundData(
    blockIterator: Generator<Block, void, unknown>,
    chunkDataContainer: Uint16Array,
    chunkBox: Box3,
  ) {
    let written_blocks_count = 0
    for (const block of blockIterator) {
      const blockData = block.data
      const blockType = block.data.type
      const blockLocalPos = block.localPos as Vector3
      blockLocalPos.x += 1
      // block.localPos.y = patch.bbox.max.y
      blockLocalPos.z += 1
      blockData.type =
        highlightPatchBorders(blockLocalPos, blockType) || blockType
      written_blocks_count += this.writeChunkBlocks(
        chunkDataContainer,
        chunkBox,
        blockLocalPos,
        blockData,
        block.buffer,
      )
    }
    return written_blocks_count
  }

  fillEntitiesData(
    entityBlocksIterator: Generator<Block, void, unknown>,
    chunkData: Uint16Array,
    chunkBox: Box3,
  ) {
    let writtenBlocksCount = 0
    // iter over entity blocks
    for (const entityBlock of entityBlocksIterator) {
      const entityLocalPos = entityBlock.localPos as Vector3
      if (entityBlock.buffer) {
        entityLocalPos.x += 1
        entityLocalPos.z += 1
        // bmin.y = block.localPos.y
        writtenBlocksCount += this.writeChunkBlocks(
          chunkData,
          chunkBox,
          entityLocalPos,
          entityBlock.data,
          entityBlock.buffer,
        )
      }
    }
    return writtenBlocksCount
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
}
