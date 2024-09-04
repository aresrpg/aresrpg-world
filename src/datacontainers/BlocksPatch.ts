import { Box2, Box3, Vector2, Vector3 } from 'three'

import {
  Block,
  PatchBlock,
  EntityData,
  PatchKey,
} from '../common/types'
import {
  patchBoxFromKey,
  parsePatchKey,
  parseThreeStub,
  asVect3,
  asVect2,
  serializePatchId,
} from '../common/utils'
import { BlockType } from '../procgen/Biome'
import { WorldConf } from '../index'

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
  key?: string
  bounds: Box2
  rawData: Uint32Array
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

export class BlocksPatch extends DataContainer<Uint32Array> {
  rawData!: Uint32Array
  margin = 0
  key = ''  // needed for patch export
  patchId: Vector2 | undefined

  constructor(patchBoundsOrKey: Box2 | PatchKey = new Box2(), margin = 1) {
    super(parseBoundsOrKeyInput(patchBoundsOrKey))
    const patchId = typeof patchBoundsOrKey === "string" ? parsePatchKey(patchBoundsOrKey) : null
    if (patchId) {
      this.id = patchId
    }
    this.margin = margin
    this.init(this.bounds)
  }

  override init(bounds: Box2): void {
    super.init(bounds)
    this.rawData = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
  }

  get id() {
    return this.patchId
  }

  set id(patchId: Vector2 | undefined) {
    this.patchId = patchId
    this.key = serializePatchId(patchId)
  }

  get extendedBounds() {
    return this.bounds.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBounds.getSize(new Vector2())
  }

  get localBox() {
    const localBox = new Box2(new Vector2(0), this.dimensions.clone())
    return localBox
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
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
    const blockRawData = this.rawData[blockIndex]
    const blockData = this.decodeBlockData(blockRawData as number)
    return blockData
  }

  writeBlockData(blockIndex: number, blockData: BlockData) {
    this.rawData[blockIndex] = this.encodeBlockData(blockData)
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

  override getIndex(localPos: Vector2 | Vector3) {
    localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
    return (
      (localPos.x + this.margin) * this.extendedDims.x +
      localPos.y + this.margin
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

  toStub() {
    const { bounds, rawData } = this
    const patchStub: PatchStub = {
      bounds,
      rawData
    }
    if (this.key && this.key !== '') patchStub.key = this.key
    return patchStub
  }

  fromStub(patchStub: PatchStub) {
    this.init(parseThreeStub(patchStub.bounds) as Box2)
    this.id = patchStub.key ? parsePatchKey(patchStub.key) : this.id
    this.rawData.set(patchStub.rawData)
    this.bounds.min.y = patchStub.bounds.min.y
    this.bounds.max.y = patchStub.bounds.max.y
    return this
  }

  // getBlocksRow(zRowIndex: number) {
  //   const rowStart = zRowIndex * this.dimensions.y
  //   const rowEnd = rowStart + this.dimensions.x
  //   const rowRawData = this.rawData.slice(rowStart, rowEnd)
  //   return rowRawData
  // }

  // getBlocksCol(xColIndex: number) {

  // }

  /**
   * Split container into fixed size patches
   */
  // splitAsPatchMap() {

  // }
}
