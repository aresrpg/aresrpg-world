import { Box3, Vector2, Vector3 } from 'three'

import {
  Block,
  PatchBlock,
  WorldChunk,
  ChunkDataContainer,
  EntityData,
} from '../common/types'
import {
  patchBoxFromKey,
  parsePatchKey,
  parseThreeStub,
  serializeChunkId,
  asVect2,
  asBox3,
  chunkBoxFromId,
  patchLowerId,
  serializePatchId,
  asBox2,
} from '../common/utils'
import { BlockType } from '../procgen/Biome'
import { WorldConfig } from '../config/WorldConfig'
import { ChunkFactory } from '../index'

import { GenericPatch } from './DataContainers'

export enum BlockMode {
  DEFAULT,
  BOARD_CONTAINER,
}

export type BlockData = {
  level: number
  type: BlockType
  mode?: BlockMode
}

export type PatchStub = {
  key: string
  bbox: Box3
  rawDataContainer: Uint32Array
  entities: EntityData[]
}

// bits allocated per block data type
// total bits required to store a block: 9+10+3 = 22 bits
const BlockDataBitAllocation = {
  level: 9, // support level values ranging from 0 to 512
  type: 10, // support up to 1024 different block types
  mode: 3, // support for 8 different block mode
}

export type BlockIteratorRes = IteratorResult<Block, void>

const getDefaultPatchDim = () =>
  new Vector2(WorldConfig.patchSize, WorldConfig.patchSize)

/**
 * GenericBlocksContainer
 * multi purpose blocks container
 */
export class BlocksPatch implements GenericPatch {
  bbox: Box3
  dimensions = new Vector3()
  margin = 0

  rawDataContainer: Uint32Array
  entities: EntityData[] = []

  key: string | null
  id: Vector2 | null

  constructor(patchBoxOrKey: Box3 | string, margin = 1) {
    this.bbox =
      patchBoxOrKey instanceof Box3
        ? patchBoxOrKey.clone()
        : asBox3(patchBoxFromKey(patchBoxOrKey, getDefaultPatchDim()))
    this.key = patchBoxOrKey instanceof Box3 ? null : patchBoxOrKey
    this.id = this.key ? parsePatchKey(this.key) : null
    this.bbox.getSize(this.dimensions)
    this.margin = margin
    const { extendedDims } = this
    this.rawDataContainer = new Uint32Array(extendedDims.x * extendedDims.z)
  }

  duplicate() {
    const copy = new BlocksPatch(this.key || this.bbox) // new BlocksPatch(this.bbox)
    this.rawDataContainer.forEach(
      (rawVal, i) => (copy.rawDataContainer[i] = rawVal),
    )
    copy.entities = this.entities.map(entity => {
      const entityCopy: EntityData = {
        ...entity,
        bbox: entity.bbox.clone(),
      }
      return entityCopy
    })
    return copy as GenericPatch
  }

  decodeBlockData(rawData: number): BlockData {
    const shift = BlockDataBitAllocation
    const level =
      (rawData >> (shift.type + shift.mode)) & ((1 << shift.level) - 1) // Extract 9 bits for level
    const type = (rawData >> shift.mode) & ((1 << shift.type) - 1) // Extract 10 bits for type
    const mode = rawData & ((1 << shift.mode) - 1) // Extract 3 bits for mode
    const blockData: BlockData = {
      level,
      type,
      mode,
    }
    return blockData
  }

  encodeBlockData(blockData: BlockData): number {
    const { level, type, mode } = blockData
    const shift = BlockDataBitAllocation
    let blockRawVal = level
    blockRawVal = (blockRawVal << shift.type) | type
    blockRawVal = (blockRawVal << shift.mode) | (mode || BlockMode.DEFAULT)
    return blockRawVal
  }

  readBlockData(blockIndex: number): BlockData {
    const blockRawData = this.rawDataContainer[blockIndex]
    const blockData = this.decodeBlockData(blockRawData as number)
    return blockData
  }

  writeBlockData(blockIndex: number, blockData: BlockData) {
    this.rawDataContainer[blockIndex] = this.encodeBlockData(blockData)
  }

  get extendedBox() {
    return this.bbox.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBox.getSize(new Vector3())
  }

  get localBox() {
    const localBox = new Box3(new Vector3(0), this.dimensions.clone())
    return localBox
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
  }

  isWithinLocalRange(localPos: Vector3) {
    return (
      localPos.x >= 0 &&
      localPos.x < this.dimensions.x &&
      localPos.z >= 0 &&
      localPos.z < this.dimensions.z
    )
  }

  isWithinGlobalRange(globalPos: Vector3) {
    return (
      globalPos.x >= this.bbox.min.x &&
      globalPos.x < this.bbox.max.x &&
      globalPos.z >= this.bbox.min.z &&
      globalPos.z < this.bbox.max.z
    )
  }

  adjustRangeBox(rangeBox: Box3 | Vector3, local = false) {
    rangeBox =
      rangeBox instanceof Box3 ? rangeBox : new Box3(rangeBox, rangeBox)
    const { min, max } = local ? this.localBox : this.bbox
    const rangeMin = new Vector3(
      Math.max(Math.floor(rangeBox.min.x), min.x),
      0,
      Math.max(Math.floor(rangeBox.min.z), min.z),
    )
    const rangeMax = new Vector3(
      Math.min(Math.floor(rangeBox.max.x), max.x),
      0,
      Math.min(Math.floor(rangeBox.max.z), max.z),
    )
    return local
      ? new Box3(rangeMin, rangeMax)
      : new Box3(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
  }

  getBlockIndex(localPos: Vector3) {
    return (
      (localPos.x + this.margin) * this.extendedDims.x +
      localPos.z +
      this.margin
    )
  }

  toLocalPos(pos: Vector3) {
    const origin = this.bbox.min.clone()
    origin.y = 0
    return pos.clone().sub(origin)
  }

  toGlobalPos(pos: Vector3) {
    const origin = this.bbox.min.clone()
    origin.y = 0
    return origin.add(pos)
  }

  getBlock(inputPos: Vector3, isLocalPos = true) {
    const isWithingRange = isLocalPos
      ? this.isWithinLocalRange(inputPos)
      : this.isWithinGlobalRange(inputPos)
    let block: PatchBlock | undefined
    if (isWithingRange) {
      const localPos = isLocalPos ? inputPos : this.toLocalPos(inputPos)
      const pos = isLocalPos ? this.toGlobalPos(inputPos) : inputPos
      const blockIndex = this.getBlockIndex(localPos)
      const blockData = this.readBlockData(blockIndex) || BlockType.NONE
      localPos.y = blockData.level
      pos.y = blockData.level
      block = {
        index: blockIndex,
        pos: this.toGlobalPos(localPos),
        localPos,
        data: blockData,
      }
    }
    return block
  }

  setBlock(pos: Vector3, blockData: BlockData, isLocalPos = false) {
    const isWithingPatch = isLocalPos
      ? this.isWithinLocalRange(pos)
      : this.isWithinGlobalRange(pos)
    if (isWithingPatch) {
      const localPos = isLocalPos ? pos : this.toLocalPos(pos)
      const blockIndex = this.getBlockIndex(localPos)
      this.writeBlockData(blockIndex, blockData)
    }
    // const levelMax = blockLevel + blockData.over.length
    // bbox.min.y = Math.min(bbox.min.y, levelMax)
    // bbox.max.y = Math.max(bbox.max.y, levelMax)
  }

  getBlocksRow(zRowIndex: number) {
    const rowStart = zRowIndex * this.dimensions.z
    const rowEnd = rowStart + this.dimensions.x
    const rowRawData = this.rawDataContainer.slice(rowStart, rowEnd)
    return rowRawData
  }

  // getBlocksCol(xColIndex: number) {

  // }

  /**
   *
   * @param rangeBox iteration range as global coords
   * @param skipMargin
   */
  *iterOverBlocks(rangeBox?: Box3 | Vector3, skipMargin = true) {
    // convert to local coords to speed up iteration
    const localBbox = rangeBox
      ? this.adjustRangeBox(rangeBox)
      : this.localExtendedBox

    const isMarginBlock = ({ x, z }: { x: number; z: number }) =>
      !rangeBox &&
      this.margin > 0 &&
      (x === localBbox.min.x ||
        x === localBbox.max.x - 1 ||
        z === localBbox.min.z ||
        z === localBbox.max.z - 1)

    let index = 0
    for (let { x } = localBbox.min; x < localBbox.max.x; x++) {
      for (let { z } = localBbox.min; z < localBbox.max.z; z++) {
        const localPos = new Vector3(x, 0, z)
        if (!skipMargin || !isMarginBlock(localPos)) {
          index = rangeBox ? this.getBlockIndex(localPos) : index
          const blockData = this.readBlockData(index) || BlockType.NONE
          localPos.y = blockData.level
          const block: PatchBlock = {
            index,
            pos: this.toGlobalPos(localPos),
            localPos,
            data: blockData,
          }
          yield block
        }
        index++
      }
    }
  }

  containsPoint(blockPos: Vector3) {
    return asBox2(this.bbox).containsPoint(asVect2(blockPos))
    // return (
    //   blockPos.x >= this.bbox.min.x &&
    //   blockPos.z >= this.bbox.min.z &&
    //   blockPos.x < this.bbox.max.x &&
    //   blockPos.z < this.bbox.max.z
    // )
  }

  *iterEntityChunkBlocks(entityChunk: ChunkDataContainer) {
    // return overlapping blocks between entity and container
    const entityDims = entityChunk.bbox.getSize(new Vector3())
    const blocks = this.iterOverBlocks(entityChunk.bbox)

    for (const block of blocks) {
      // const buffer = entityChunk.data.slice(chunkBufferIndex, chunkBufferIndex + entityDims.y)
      const chunkLocalPos = block.pos.clone().sub(entityChunk.bbox.min)
      const buffIndex =
        chunkLocalPos.z * entityDims.x * entityDims.y +
        chunkLocalPos.x * entityDims.y
      block.buffer = entityChunk.data.slice(buffIndex, buffIndex + entityDims.y)
      const buffOffset = entityChunk.bbox.min.y - block.pos.y
      const buffSrc = Math.abs(Math.min(0, buffOffset))
      const buffDest = Math.max(buffOffset, 0)
      block.buffer = block.buffer?.copyWithin(buffDest, buffSrc)
      block.buffer =
        buffOffset < 0
          ? block.buffer?.fill(BlockType.NONE, buffOffset)
          : block.buffer
      // block.buffer = new Array(20).fill(BlockType.TREE_TRUNK)
      yield block
    }
  }

  // multi-pass chunk filling
  toChunk(chunkBox: Box3) {
    let totalWrittenBlocks = 0
    chunkBox = chunkBox || this.bbox
    const chunkDims = chunkBox.getSize(new Vector3())
    const chunkData = new Uint16Array(chunkDims.x * chunkDims.y * chunkDims.z)
    // Ground pass
    const groundBlocksIterator = this.iterOverBlocks(undefined, false)
    // ground blocks pass
    totalWrittenBlocks += ChunkFactory.default.fillGroundData(
      groundBlocksIterator,
      chunkData,
      chunkBox,
    )
    // Entities pass
    for (const entity of this.entities) {
      // const entityChunk = this.buildEntityChunk(entity)
      const entityChunk = ChunkFactory.chunkifyEntity(entity)
      const entityDataIterator = this.iterEntityChunkBlocks(entityChunk) // this.iterEntityBlocks(entity)
      totalWrittenBlocks += ChunkFactory.default.mergeEntitiesData(
        entityDataIterator,
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

  get chunkIds() {
    return this.id ? ChunkFactory.default.genChunksIdsFromPatchId(this.id) : []
  }

  toChunks() {
    const chunks = this.chunkIds.map(chunkId => {
      const chunkBox = chunkBoxFromId(chunkId, WorldConfig.patchSize)
      const chunk = this.toChunk(chunkBox)
      const worldChunk: WorldChunk = {
        key: serializeChunkId(chunkId),
        data: chunk.data,
      }
      return worldChunk
    })
    return chunks
  }

  static fromStub(patchStub: any) {
    const { rawDataContainer, entities } = patchStub
    const bbox = parseThreeStub(patchStub.bbox) as Box3
    const patchCenter = asVect2(bbox.getCenter(new Vector3()))
    const patchDim = asVect2(bbox.getSize(new Vector3()).round())
    const patchId = patchLowerId(patchCenter, patchDim)
    const patchKey = patchStub.key || serializePatchId(patchId)
    const patch = new BlocksPatch(patchKey)
    patch.rawDataContainer = rawDataContainer
    patch.entities = entities.map((stub: EntityData) => ({
      ...stub,
      bbox: parseThreeStub(stub.bbox),
    }))
    patch.bbox.min.y = patchStub.bbox.min.y
    patch.bbox.max.y = patchStub.bbox.max.y
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return patch
  }
}
