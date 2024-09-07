import { PatchId } from '../common/types'
import { asVect3, chunkBoxFromId, serializeChunkId } from '../common/utils'
import { EntityChunk } from '../datacontainers/EntityChunk'
import { WorldChunk, WorldChunkStub } from '../datacontainers/WorldChunk'
import { BlockMode, BlockType, GroundPatch, WorldConf } from '../index'

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
      patch.fillChunk(worldChunk)
      // Entities pass
      patchEntities.forEach(entityChunk =>
        patch.mergeEntityVoxels(entityChunk, worldChunk),
      )
      const worldChunkStub: WorldChunkStub = {
        key: serializeChunkId(chunkId),
        data: worldChunk.chunkData,
      }
      return worldChunkStub
    })
    return worldChunksStubs
  }
}
