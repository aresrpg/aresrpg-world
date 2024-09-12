import { Vector3 } from 'three'
import { PatchId } from '../common/types'
import { asBox2, asVect3, chunkBoxFromId, serializeChunkId } from '../common/utils'
import { EntityChunk } from '../datacontainers/EntityChunk'
import { WorldChunk, WorldChunkStub } from '../datacontainers/WorldChunk'
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
   * chunkify or chunksAssembly
   * Assembles world building blocks (GroundPatch, EntityChunk) together
   * to form final world chunk
   */
  chunkify(patch: GroundPatch, patchEntities: EntityChunk[]) {
    const patchChunkIds = patch.id
      ? ChunkFactory.default.genChunksIdsFromPatchId(patch.id)
      : []
    const worldChunksStubs = patchChunkIds.map(chunkId => {
      const chunkBox = chunkBoxFromId(chunkId, WorldConf.patchSize)
      const worldChunk = new WorldChunk(chunkBox)
      // Ground pass
      this.mergeGroundBlocks(worldChunk, patch)
      // Entities pass
      this.mergePatchEntities(worldChunk, patch, patchEntities)
      const worldChunkStub: WorldChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.chunkData,
      }
      return worldChunkStub
    })
    return worldChunksStubs
  }

  mergeGroundBlocks(worldChunk: WorldChunk, patch: GroundPatch){
    const blocks = patch.iterBlocksQuery(undefined, false)
      for (const block of blocks) {
        const blockData = block.data
        const blockType = block.data.type
        const blockLocalPos = block.localPos as Vector3
        blockLocalPos.x += 1
        // block.localPos.y = patch.bbox.max.y
        blockLocalPos.z += 1
        blockData.type =
          highlightPatchBorders(blockLocalPos, blockType) || blockType
        worldChunk.writeBlock(blockLocalPos, blockData, block.buffer || [])
      }
  }

  mergePatchEntities(worldChunk: WorldChunk, patch: GroundPatch, patchEntities: EntityChunk[]) {
    patchEntities.forEach(entityChunk => {
      // return overlapping blocks between entity and container
      const patchBlocksIter = patch.iterBlocksQuery(asBox2(entityChunk.chunkBox))
      // iter over entity blocks
      for (const block of patchBlocksIter) {
        // const buffer = entityChunk.data.slice(chunkBufferIndex, chunkBufferIndex + entityDims.y)
        let bufferData = entityChunk.getBlocksBuffer(block.pos)
        const buffOffset = entityChunk.chunkBox.min.y - block.pos.y
        const buffSrc = Math.abs(Math.min(0, buffOffset))
        const buffDest = Math.max(buffOffset, 0)
        bufferData = bufferData.copyWithin(buffDest, buffSrc)
        bufferData =
          buffOffset < 0
            ? bufferData.fill(BlockType.NONE, buffOffset)
            : bufferData
        block.localPos.x += 1
        block.localPos.z += 1
        worldChunk.writeBlock(block.localPos, block.data, bufferData)
      }
    })
  }
}