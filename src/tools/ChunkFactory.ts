import { MathUtils, Vector2, Vector3 } from 'three'

import { PatchId } from '../common/types'
import {
  asBox2,
  asVect2,
  asVect3,
  chunkBoxFromId,
  serializeChunkId,
} from '../common/utils'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { InstancedEntity } from '../datacontainers/OvergroundEntities'
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
   * Assembles layers together: ground, world objects
   */
  chunkifyPatch(groundPatchLayer: GroundPatch, overgroundEntities: InstancedEntity[]) {
    const patchChunkIds = groundPatchLayer.id
      ? ChunkFactory.default.genChunksIdsFromPatchId(groundPatchLayer.id)
      : []
    const worldChunksStubs = patchChunkIds.map(chunkId => {
      const chunkBox = chunkBoxFromId(chunkId, WorldConf.patchSize)
      const worldChunk = new ChunkContainer(chunkBox)
      // this.mergeGroundBlocks(worldChunk, patch)
      // this.mergePatchEntities(worldChunk, patch, worldObjects)
      this.mergePatchLayersToChunk(worldChunk, groundPatchLayer, overgroundEntities)
      const worldChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.rawData,
      }
      return worldChunkStub
    })
    return worldChunksStubs
  }

  mergePatchLayersToChunk(chunkContainer: ChunkContainer, groundPatchLayer: GroundPatch, overgroundEntities: InstancedEntity[]) {
    this.mergeGroundLayer(chunkContainer, groundPatchLayer)
    this.mergePatchEntities(chunkContainer, groundPatchLayer, overgroundEntities)
  }

  mergeLayersBuffers(){

  }

  mergeOverlappingBuffers(){
    
  }


  mergeGroundLayer(worldChunk: ChunkContainer, patchGroundLayer: GroundPatch) {
    const ymin = worldChunk.bounds.min.y
    const ymax = worldChunk.bounds.max.y
    const blocks = patchGroundLayer.iterBlocksQuery(undefined, false)
    for (const block of blocks) {
      const blockLocalPos = block.localPos as Vector3
      blockLocalPos.x += 1
      // block.localPos.y = patch.bbox.max.y
      blockLocalPos.z += 1
      const blockType = highlightPatchBorders(blockLocalPos, block.data.type) || block.data.type
      const blockMode = block.data.mode
      // generate ground buffer
      let bufferCount = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
      const groundBuffer = [];
      while (bufferCount > 0) {
        const rawData = this.voxelDataEncoder(
          blockType,
          blockMode,
        )
        groundBuffer.push(rawData)
        bufferCount--
      }

      // worldChunk.writeSector()
      worldChunk.writeBuffer(blockLocalPos, block.data, [])
    }
  }


  mergePatchEntities(
    worldChunk: ChunkContainer,
    groundLayer: GroundPatch,
    overgroundEntities: InstancedEntity[],
  ) {
    overgroundEntities.forEach(instancedEntity => {
      const { spawnLoc, entity } = instancedEntity
      const entityBounds = asBox2(entity.template.bounds).translate(asVect2(spawnLoc))
      const center = entityBounds.getCenter(new Vector2()).floor()
      spawnLoc.y = groundLayer.getBlock(center)?.pos.y || 0
      // return overlapping blocks between entity and container
      const patchBlocksIter = groundLayer.iterBlocksQuery(entityBounds)
      // iter over entity blocks
      for (const block of patchBlocksIter) {
        // const buffer = instancedEntity.data.slice(chunkBufferIndex, chunkBufferIndex + entityDims.y)
        // translate queried loc to template local pos
        const localPos = block.pos.clone().sub(spawnLoc)
        let bufferData = entity.template.readBufferY(asVect2(localPos))
        const buffOffset = spawnLoc.y - block.pos.y
        const buffSrc = Math.abs(Math.min(0, buffOffset))
        const buffDest = Math.max(buffOffset, 0)
        bufferData = bufferData.copyWithin(buffDest, buffSrc)
        bufferData =
          buffOffset < 0
            ? bufferData.fill(BlockType.NONE, buffOffset)
            : bufferData
        block.localPos.x += 1
        block.localPos.z += 1
        worldChunk.writeBuffer(block.localPos, block.data, bufferData)
      }
    })
  }
}
