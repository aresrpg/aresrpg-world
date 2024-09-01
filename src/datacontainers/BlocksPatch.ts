import { Box2, Box3, Vector2, Vector3 } from 'three'

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
  chunkBoxFromId,
  asBox2,
  asVect3,
  asVect2,
} from '../common/utils'
import { BlockType } from '../procgen/Biome'
import { ChunkFactory, WorldConf } from '../index'

import { DataContainer } from './DataContainers'

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
  bounds: Box3
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
  new Vector2(WorldConf.patchSize, WorldConf.patchSize)

const parseBoundsOrKeyInput = (patchBoundsOrKey: Box2 | string) => {
  const bounds = patchBoundsOrKey instanceof Box2
    ? patchBoundsOrKey.clone()
    : patchBoxFromKey(patchBoundsOrKey, getDefaultPatchDim())
  return bounds
}

/**
 * GenericBlocksContainer
 * multi purpose blocks container
 */
export class BlocksPatch extends DataContainer<Uint32Array> {
  rawDataContainer: Uint32Array
  margin = 0

  key: string | null
  id: Vector2 | null

  constructor(patchBoundsOrKey: Box2 | string, margin = 1) {
    super(parseBoundsOrKeyInput(patchBoundsOrKey))
    this.key = typeof patchBoundsOrKey === "string" ? patchBoundsOrKey : null
    this.id = this.key ? parsePatchKey(this.key) : null
    this.margin = margin
    this.rawDataContainer = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
  }

  get extendedBox() {
    return this.bounds.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBox.getSize(new Vector2())
  }

  get localBox() {
    const localBox = new Box2(new Vector2(0), this.dimensions.clone())
    return localBox
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
  }

  /**
   * @param targetBox if unspecified will be whole source container
   */
  copyContentOverTarget(targetBox: Box2) {
    const source = this
    const targetInput = targetBox || source.bounds
    const target = new BlocksPatch(targetInput)
    super.copyContentOverTargetContainer(target)
  }

  static fromStub(patchOrStub: BlocksPatch) {
    const bounds = parseThreeStub(patchOrStub.bounds) as Box2
    const patch = new BlocksPatch(patchOrStub.key || bounds)
    patchOrStub.rawDataContainer.forEach(
      (rawVal, i) => patch.rawDataContainer[i] = rawVal)
    patch.bounds.min.y = patchOrStub.bounds.min.y
    patch.bounds.max.y = patchOrStub.bounds.max.y
    return patch
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

  adjustRangeBox(rangeBox: Box2 | Vector2, local = false) {
    rangeBox =
      rangeBox instanceof Box2 ? rangeBox : new Box2(rangeBox, rangeBox)
    const { min, max } = local ? this.localBox : this.bounds
    const rangeMin = new Vector2(
      Math.max(Math.floor(rangeBox.min.x), min.x),
      Math.max(Math.floor(rangeBox.min.y), min.y),
    )
    const rangeMax = new Vector2(
      Math.min(Math.floor(rangeBox.max.x), max.x),
      Math.min(Math.floor(rangeBox.max.y), max.y),
    )
    return local
      ? new Box2(rangeMin, rangeMax)
      : new Box2(asVect2(this.toLocalPos(asVect3(rangeMin))),
        asVect2(this.toLocalPos(asVect3(rangeMax))))
  }

  override getIndex(localPos: Vector3) {
    return (
      (localPos.x + this.margin) * this.extendedDims.x +
      localPos.z +
      this.margin
    )
  }

  getBlock(inputPos: Vector3, isLocalPos = true) {
    const isWithingRange = isLocalPos
      ? this.inLocalRange(inputPos)
      : this.inGlobalRange(inputPos)
    let block: PatchBlock | undefined
    if (isWithingRange) {
      const localPos = isLocalPos ? inputPos : this.toLocalPos(inputPos)
      const pos = isLocalPos ? this.toGlobalPos(inputPos) : inputPos
      const blockIndex = this.getIndex(localPos)
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
      ? this.inLocalRange(pos)
      : this.inGlobalRange(pos)
    if (isWithingPatch) {
      const localPos = isLocalPos ? pos : this.toLocalPos(pos)
      const blockIndex = this.getIndex(localPos)
      this.writeBlockData(blockIndex, blockData)
    }
    // const levelMax = blockLevel + blockData.over.length
    // bounds.min.y = Math.min(bounds.min.y, levelMax)
    // bounds.max.y = Math.max(bounds.max.y, levelMax)
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
  *iterBlocksQuery(rangeBox?: Box2 | Vector2, skipMargin = true) {
    // convert to local coords to speed up iteration
    const localBbox = rangeBox
      ? this.adjustRangeBox(rangeBox)
      : this.localExtendedBox

    const isMarginBlock = ({ x, z }: { x: number; z: number }) =>
      !rangeBox &&
      this.margin > 0 &&
      (x === localBbox.min.x ||
        x === localBbox.max.x - 1 ||
        z === localBbox.min.y ||
        z === localBbox.max.y - 1)

    let index = 0
    for (let { x } = localBbox.min; x < localBbox.max.x; x++) {
      for (let { y } = localBbox.min; y < localBbox.max.y; y++) {
        const localPos = new Vector3(x, 0, y)
        if (!skipMargin || !isMarginBlock(localPos)) {
          index = rangeBox ? this.getIndex(localPos) : index
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

  *iterEntityChunkBlocks(entityChunk: ChunkDataContainer) {
    // return overlapping blocks between entity and container
    const entityDims = entityChunk.box.getSize(new Vector3())
    const blocks = this.iterBlocksQuery(asBox2(entityChunk.box))

    for (const block of blocks) {
      // const buffer = entityChunk.data.slice(chunkBufferIndex, chunkBufferIndex + entityDims.y)
      const chunkLocalPos = block.pos.clone().sub(entityChunk.box.min)
      const buffIndex =
        chunkLocalPos.z * entityDims.x * entityDims.y +
        chunkLocalPos.x * entityDims.y
      block.buffer = entityChunk.data.slice(buffIndex, buffIndex + entityDims.y)
      const buffOffset = entityChunk.box.min.y - block.pos.y
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
    chunkBox = chunkBox || this.bounds
    const chunkDims = chunkBox.getSize(new Vector3())
    const chunkData = new Uint16Array(chunkDims.x * chunkDims.y * chunkDims.z)
    // Ground pass
    const groundBlocksIterator = this.iterBlocksQuery(undefined, false)
    // ground blocks pass
    totalWrittenBlocks += ChunkFactory.default.voxelizeGround(
      groundBlocksIterator,
      chunkData,
      chunkBox,
    )
    // Entities pass
    // for (const entity of this.entities) {
    //   // const entityChunk = this.buildEntityChunk(entity)
    //   const entityChunk = ChunkFactory.chunkifyEntity(entity)
    //   const entityDataIterator = this.iterEntityChunkBlocks(entityChunk) // this.iterEntityBlocks(entity)
    //   totalWrittenBlocks += ChunkFactory.default.mergeEntitiesData(
    //     entityDataIterator,
    //     chunkData,
    //     chunkBox,
    //   )
    // }

    // const size = Math.round(Math.pow(chunk.data.length, 1 / 3))
    // const dimensions = new Vector3(size, size, size)
    const chunk = {
      bounds: chunkBox,
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
      const chunkBox = chunkBoxFromId(chunkId, WorldConf.patchSize)
      const chunk = this.toChunk(chunkBox)
      const worldChunk: WorldChunk = {
        key: serializeChunkId(chunkId),
        data: chunk.data,
      }
      return worldChunk
    })
    return chunks
  }

  /**
   * Split container into fixed size patches
   */
  asSplittedPatchMap() {

  }
}
