import { Box2, Vector2, Vector3 } from 'three'

import { BlockData, GroundBlock, PatchBlock, PatchKey } from '../common/types'
import {
  parsePatchKey,
  parseThreeStub,
  asVect3,
  asVect2,
} from '../common/utils'
import { BlockMode, WorldComputeProxy } from '../index'
import { BlockType } from '../procgen/Biome'

import { PatchContainer } from './PatchContainer'

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

export type BlockIteratorRes = IteratorResult<GroundBlock, void>
/**
 * field | bits alloc | value range
 * -----|------------|--------------------------------
 * ground elevation |  10 | 1024
 * groundIndex#  | 6 | 64
 * overgroundIndex  | 16 | support for 65536 different configurations
 *
 */
export class GroundPatch extends PatchContainer<Uint32Array> {
  rawData: Uint32Array
  isEmpty = true

  constructor(boundsOrPatchKey: Box2 | PatchKey = new Box2(), margin = 1) {
    super(boundsOrPatchKey, margin)
    this.rawData = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
  }

  override init(bounds: Box2): void {
    super.init(bounds)
    this.rawData = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
  }

  duplicate() {
    const copy = new GroundPatch(this.key || this.bounds, this.margin)
    copy.rawData.set(this.rawData)
    return copy
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

  adjustInputBounds(input: Box2 | Vector2, local = false) {
    const rangeBox = input instanceof Box2 ? input : new Box2(input, input)
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
      : new Box2(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
  }

  override getIndex(localPos: Vector2 | Vector3) {
    localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
    return (
      (localPos.y + this.margin) * this.extendedDims.x +
      localPos.x +
      this.margin
    )
  }

  getBlock(inputPos: Vector2 | Vector3, isLocalPos = false) {
    inputPos = inputPos instanceof Vector2 ? inputPos : asVect2(inputPos)
    const isWithingRange = isLocalPos
      ? this.inLocalRange(inputPos)
      : this.inWorldRange(inputPos)
    let block: PatchBlock | undefined
    if (isWithingRange) {
      const localPos = isLocalPos ? inputPos : this.toLocalPos(inputPos)
      const pos = isLocalPos ? this.toWorldPos(inputPos) : inputPos
      const blockIndex = this.getIndex(localPos)
      const blockData = this.readBlockData(blockIndex) || BlockType.NONE
      block = {
        index: blockIndex,
        pos: asVect3(pos, blockData.level),
        localPos: asVect3(localPos, blockData.level),
        data: blockData,
      }
    }
    return block
  }

  setBlock(
    inputPos: Vector2 | Vector3,
    blockData: BlockData,
    isLocalPos = false,
  ) {
    inputPos = inputPos instanceof Vector2 ? inputPos : asVect2(inputPos)
    const isWithinPatch = isLocalPos
      ? this.inLocalRange(inputPos)
      : this.inWorldRange(inputPos)
    if (isWithinPatch) {
      const localPos = isLocalPos ? inputPos : this.toLocalPos(inputPos)
      const blockIndex = this.getIndex(localPos)
      this.writeBlockData(blockIndex, blockData)
    }
    // const levelMax = blockLevel + blockData.over.length
    // bounds.min.y = Math.min(bounds.min.y, levelMax)
    // bounds.max.y = Math.max(bounds.max.y, levelMax)
  }

  // genGroundBuffer(blockIndex: number, ymin: number, ymax: number) {
  //   const block = this.readBlockData(blockIndex)
  //   const bufferCount = MathUtils.clamp(block.level - ymin, 0, ymax - ymin)
  //   const groundBuffer = []
  //   while (bufferCount > 0) {
  //     groundBuffer.push(block.type)
  //   }
  //   return groundBuffer
  // }

  /**
   *
   * @param rangeBox iteration range as global coords
   * @param skipMargin
   */
  *iterBlocksQuery(iterBounds?: Box2 | Vector2, skipMargin = true) {
    // convert to local coords to speed up iteration
    const localBounds = iterBounds
      ? this.adjustInputBounds(iterBounds)
      : this.localExtendedBox

    const isMarginBlock = ({ x, y }: { x: number; y: number }) =>
      !iterBounds &&
      this.margin > 0 &&
      (x === localBounds.min.x ||
        x === localBounds.max.x - 1 ||
        y === localBounds.min.y ||
        y === localBounds.max.y - 1)

    let index = 0
    for (let { y } = localBounds.min; y < localBounds.max.y; y++) {
      for (let { x } = localBounds.min; x < localBounds.max.x; x++) {
        const localPos = new Vector2(x, y)
        if (!skipMargin || !isMarginBlock(localPos)) {
          index = iterBounds ? this.getIndex(localPos) : index
          const blockData = this.readBlockData(index) || BlockType.NONE
          const block: PatchBlock = {
            index,
            pos: asVect3(this.toWorldPos(localPos), blockData.level),
            localPos: asVect3(localPos, blockData.level),
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
      rawData,
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

  async fillGroundData() {
    const stub: PatchStub = await WorldComputeProxy.instance.bakeGroundPatch(
      this.key || this.bounds,
    )
    this.rawData.set(stub.rawData)
    this.isEmpty = false
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
