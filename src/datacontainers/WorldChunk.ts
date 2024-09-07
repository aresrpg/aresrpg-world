import { Box3, MathUtils, Vector3 } from 'three'

import { ChunkKey } from '../common/types'
import { ChunkFactory } from '../index'

import { BlockData, BlockMode } from './GroundPatch'

export type ChunkDataContainer = {
  box: Box3
  data: Uint16Array
}

export type WorldChunkStub = {
  key: ChunkKey
  data: Uint16Array | null
}

export class WorldChunk {
  chunkBox: Box3
  chunkData: Uint16Array

  constructor(chunkBox: Box3) {
    this.chunkBox = chunkBox
    const chunkDims = chunkBox.getSize(new Vector3())
    this.chunkData = new Uint16Array(chunkDims.x * chunkDims.y * chunkDims.z)
  }

  writeBlock(
    blockLocalPos: Vector3,
    blockData: BlockData,
    bufferOver: Uint16Array | [],
  ) {
    const { chunkBox, chunkData } = this
    const chunk_size = chunkBox.getSize(new Vector3()).x // Math.round(Math.pow(chunkData.length, 1 / 3))

    let written_blocks_count = 0

    const level = MathUtils.clamp(
      blockLocalPos.y + bufferOver.length,
      chunkBox.min.y,
      chunkBox.max.y,
    )
    let buff_index = Math.max(level - blockLocalPos.y, 0)
    let h = level - chunkBox.min.y // local height
    // debug_mode && is_edge(local_pos.z, local_pos.x, h, patch_size - 2)
    //   ? BlockType.SAND
    //   : block_cache.type
    let depth = 0
    while (h >= 0) {
      const blocksIndex =
        blockLocalPos.z * Math.pow(chunk_size, 2) +
        h * chunk_size +
        blockLocalPos.x
      const blockType = buff_index > 0 ? bufferOver[buff_index] : blockData.type
      const skip =
        buff_index > 0 &&
        chunkData[blocksIndex] !== undefined &&
        !bufferOver[buff_index]
      if (!skip && blockType !== undefined) {
        // #hack: disable block mode below ground to remove checkerboard excess
        const skipBlockMode =
          depth > 0 &&
          (bufferOver.length === 0 || bufferOver[buff_index] || buff_index < 0)
        const blockMode = skipBlockMode ? BlockMode.DEFAULT : blockData.mode
        chunkData[blocksIndex] = ChunkFactory.defaultInstance.voxelDataEncoder(
          blockType,
          blockMode,
        )
        blockType && written_blocks_count++
      }
      h--
      buff_index--
      depth++
    }
    return written_blocks_count
  }
}
