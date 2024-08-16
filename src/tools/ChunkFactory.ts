import { Box3, MathUtils, Vector3 } from 'three'

import { ChunkId, PatchId, WorldChunk } from '../common/types'
import { asVect3, getBboxFromChunkId, serializeChunkId } from '../common/utils'
import { BlocksContainer, BlocksPatch, BlockType, WorldConfig } from '../index'

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
  voxelDataEncoder = (blockType: BlockType) => blockType || BlockType.NONE
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
    chunkData: Uint16Array,
    chunkBbox: Box3,
    blockLocalPos: Vector3,
    groundType: BlockType,
    bufferOver: any[] = [],
  ) {
    const chunk_size = Math.round(Math.pow(chunkData.length, 1 / 3))

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
      const blockType = buff_index > 0 ? bufferOver[buff_index] : groundType
      const skip =
        buff_index > 0 &&
        chunkData[blocksIndex] !== undefined &&
        !bufferOver[buff_index]
      if (!skip) {
        chunkData[blocksIndex] = this.voxelDataEncoder(blockType)
        blockType && written_blocks_count++
      }
      buff_index--
      h--
    }
    return written_blocks_count
  }

  fillGroundData(
    blocksContainer: BlocksContainer,
    chunkData: Uint16Array,
    chunkBox: Box3,
  ) {
    let written_blocks_count = 0
    const blocks_iter = blocksContainer.iterOverBlocks(undefined, true, false)
    for (const block of blocks_iter) {
      const blockLocalPos = block.pos
      blockLocalPos.x += 1
      // blockLocalPos.y = patch.bbox.max.y
      blockLocalPos.z += 1
      const blockType =
        highlightPatchBorders(blockLocalPos, block.type) || block.type
      written_blocks_count += this.writeChunkBlocks(
        chunkData,
        chunkBox,
        blockLocalPos,
        blockType,
      )
    }
    return written_blocks_count
  }

  fillEntitiesData(
    blocksContainer: BlocksContainer,
    chunkData: Uint16Array,
    chunkBox: Box3,
  ) {
    let written_blocks_count = 0
    // iter over container entities
    for (const entity_chunk of blocksContainer.entitiesChunks) {
      // const { min, max } = entity_chunk.bbox
      // const bmin = new Vector3(...Object.values(min))
      // const bmax = new Vector3(...Object.values(max))
      // const entity_bbox = new Box3(bmin, bmax)
      // find overlapping blocks between entity and container
      const blocks_iter = blocksContainer.iterOverBlocks(
        entity_chunk.bbox,
        true,
      )
      let chunk_index = 0
      // iter over entity blocks
      for (const block of blocks_iter) {
        const bufferStr = entity_chunk.data[chunk_index]
        const buffer =
          bufferStr && bufferStr.split(',').map(char => parseInt(char))
        if (buffer && block.localPos) {
          block.buffer = buffer
          block.localPos.x += 1
          block.localPos.z += 1
          // bmin.y = block.localPos.y
          written_blocks_count += this.writeChunkBlocks(
            chunkData,
            chunkBox,
            block.localPos,
            block.type,
            block.buffer,
          )
        }
        chunk_index++
      }
    }
    return written_blocks_count
  }

  makeChunkFromBox(blocksContainer: BlocksContainer, chunkBox?: Box3) {
    chunkBox = chunkBox || blocksContainer.bbox
    const chunkDims = chunkBox.getSize(new Vector3())
    const chunkData = new Uint16Array(chunkDims.x * chunkDims.y * chunkDims.z)
    let totalWrittenBlocks = 0
    // const debug_mode = true

    // const is_edge = (row, col, h, patch_size) =>
    //   row === 1 || row === patch_size || col === 1 || col === patch_size
    // || h === 1
    // || h === patch_size - 2

    // const patch = PatchBlocksCache.instances.find(
    //   patch =>
    //     patch.bbox.min.x === bbox.min.x + 1 &&
    //     patch.bbox.min.z === bbox.min.z + 1 &&
    //     patch.bbox.max.x === bbox.max.x - 1 &&
    //     patch.bbox.max.z === bbox.max.z - 1 &&
    //     patch.bbox.intersectsBox(bbox),
    // )

    // multi-pass chunk filling
    if (blocksContainer) {
      // ground pass
      totalWrittenBlocks += this.fillGroundData(
        blocksContainer,
        chunkData,
        chunkBox,
      )
      // overground entities pass
      totalWrittenBlocks += this.fillEntitiesData(
        blocksContainer,
        chunkData,
        chunkBox,
      )
    }
    // const size = Math.round(Math.pow(chunk.data.length, 1 / 3))
    // const dimensions = new Vector3(size, size, size)
    const chunk = {
      bbox: chunkBox,
      data: totalWrittenBlocks ? chunkData : null,
      // isEmpty: totalWrittenBlocks === 0,
    }
    return chunk
  }

  makeChunkFromId(blocksContainer: BlocksContainer, chunkId: ChunkId) {
    const chunkBox = getBboxFromChunkId(chunkId, WorldConfig.patchSize)
    const chunk = this.makeChunkFromBox(blocksContainer, chunkBox)
    const regularChunk: WorldChunk = {
      key: serializeChunkId(chunkId),
      data: chunk.data,
    }
    return regularChunk
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

  genChunksFromPatch(patch: BlocksPatch) {
    const chunkIds = this.genChunksIdsFromPatchId(patch.id)
    const chunks = chunkIds.map(chunkId => this.makeChunkFromId(patch, chunkId))
    return chunks
  }
}
