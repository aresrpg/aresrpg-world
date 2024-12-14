import { Box2, Vector2, Vector3 } from 'three'

import { GroundBlock, PatchBlock, PatchKey } from '../utils/types'
import {
  parsePatchKey,
  parseThreeStub,
  asVect3,
  asVect2,
} from '../utils/common'
import { BlockMode, WorldComputeProxy } from '../index'
import {
  BiomeNumericType,
  BiomeType,
  BlockType,
  ReverseBiomeNumericType,
} from '../procgen/Biome'

import { PatchBase, PatchStub } from './PatchBase'

export type GroundBlockData = {
  // rawVal: number,
  level: number
  biome: BiomeType
  landscapeIndex: number
  flags: number
}

export type GroundPatchStub = PatchStub & {
  valueRange?: { min: number; max: number }
  rawData: Uint32Array
}

// bits allocated per data type, total 9+4+5+3 = 21 bits
const BitAllocation = {
  level: 9, // level values ranging from 0 to 512
  biome: 4, // 16 biomes
  landscapeIndex: 5, // 32 landscapes per biome
  flags: 3, // 8 additional flags
}

export type BlockIteratorRes = IteratorResult<GroundBlock, void>

export const parseGroundFlags = (rawFlags: number) => {
  const groundFlags = {
    boardMode: (rawFlags & 1) !== 0,
    cavern: ((rawFlags >> 1) & 1) !== 0,
  }
  return groundFlags
}
/**
 * field | bits alloc | value range
 * -----|------------|--------------------------------
 * ground elevation |  10 | 1024
 * groundIndex#  | 6 | 64
 * overgroundIndex  | 16 | support for 65536 different configurations
 *
 */
export class GroundPatch extends PatchBase {
  rawData: Uint32Array
  valueRange = { min: 512, max: 0 } // here elevation
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

  decodeBlockData(rawData: number) {
    const shift = BitAllocation
    const level =
      (rawData >> (shift.biome + shift.landscapeIndex + shift.flags)) &
      ((1 << shift.level) - 1)
    const biomeNum =
      (rawData >> (shift.landscapeIndex + shift.flags)) &
      ((1 << shift.biome) - 1)
    const biome = ReverseBiomeNumericType[biomeNum] || BiomeType.Temperate
    const landscapeIndex =
      (rawData >> shift.flags) & ((1 << shift.landscapeIndex) - 1)
    const flags = rawData & ((1 << shift.flags) - 1)
    const blockData: GroundBlockData = {
      level,
      biome,
      landscapeIndex,
      flags,
    }
    return blockData
  }

  encodeBlockData(groundData: GroundBlockData): number {
    const { level, biome, landscapeIndex, flags } = groundData
    const shift = BitAllocation
    let blockRawVal = level
    blockRawVal = (blockRawVal << shift.biome) | BiomeNumericType[biome]
    blockRawVal = (blockRawVal << shift.landscapeIndex) | landscapeIndex
    blockRawVal = (blockRawVal << shift.flags) | (flags || BlockMode.REGULAR)
    return blockRawVal
  }

  readBlockData(blockIndex: number): GroundBlockData {
    const blockRawData = this.rawData[blockIndex]
    const blockData = this.decodeBlockData(blockRawData as number)
    return blockData
  }

  writeBlockData(blockIndex: number, blockData: GroundBlockData) {
    this.rawData[blockIndex] = this.encodeBlockData(blockData)
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
    blockData: GroundBlockData,
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
    const patchSectors = super.iterDataQuery(iterBounds, skipMargin)
    for (const sector of patchSectors) {
      const { index, localPos } = sector
      const blockData = this.readBlockData(index) || BlockType.NONE
      const block: PatchBlock = {
        index,
        pos: asVect3(this.toWorldPos(localPos), blockData.level),
        localPos: asVect3(localPos, blockData.level),
        data: blockData,
      }
      yield block
    }
  }

  override toStub() {
    const patchStub = super.toStub()
    const { rawData, valueRange } = this
    const groundPatchStub: GroundPatchStub = {
      ...patchStub,
      rawData,
      valueRange,
    }
    return groundPatchStub
  }

  override fromStub(patchStub: GroundPatchStub) {
    super.fromStub(patchStub)
    this.rawData.set(patchStub.rawData)
    this.valueRange.min = patchStub.valueRange?.min || this.valueRange.min
    this.valueRange.max = patchStub.valueRange?.max || this.valueRange.max
    return this
  }

  async bake() {
    const stub: GroundPatchStub = await WorldComputeProxy.current.bakeGroundPatch(
      this.key || this.bounds,
    )
    this.valueRange = stub.valueRange || this.valueRange
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
