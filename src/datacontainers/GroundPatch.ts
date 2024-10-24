import { Box2, Vector2, Vector3 } from 'three'

import { GroundBlock, PatchBlock, PatchKey } from '../utils/types'
import {
  parsePatchKey,
  parseThreeStub,
  asVect3,
  asVect2,
} from '../utils/common'
import { BlockMode, WorldComputeProxy } from '../index'
import { BiomeNumericType, BiomeType, BlockType, ReverseBiomeNumericType } from '../procgen/Biome'
import { BasePatch } from './BasePatch'


export type GroundBlockData = {
  // rawVal: number,
  level: number,
  biome: BiomeType,
  landscapeIndex: number
  flags: number
}

export type PatchStub = {
  key?: string
  valueRange?: { min: number, max: number }
  bounds: Box2
  rawData: Uint32Array
}

// bits allocated per data type, total 9+4+5+3 = 21 bits
const BitAllocation = {
  level: 9, // level values ranging from 0 to 512
  biome: 4,  // 16 biomes
  landscapeIndex: 5,  // 32 landscapes per biome
  flags: 3, // 8 additional flags
}

export type BlockIteratorRes = IteratorResult<GroundBlock, void>

export const parseGroundFlags = (rawFlags: number) => {
  const groundFlags = {
    boardMode: (rawFlags & 1) !== 0,
    cavern: ((rawFlags >> 1) & 1) !== 0
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
export class GroundPatch extends BasePatch {
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

  get extendedBounds() {
    return this.bounds.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBounds.getSize(new Vector2())
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
  }

  duplicate() {
    const copy = new GroundPatch(this.key || this.bounds, this.margin)
    copy.rawData.set(this.rawData)
    return copy
  }

  // copy occurs only on the overlapping global pos region of both containers
  static copySourceOverTargetContainer(source: any, target: any) {
    const adjustOverlapMargins = (overlap: Box2) => {
      const margin = Math.min(target.margin, source.margin) || 0
      overlap.min.x -= target.bounds.min.x === overlap.min.x ? margin : 0
      overlap.min.y -= target.bounds.min.y === overlap.min.y ? margin : 0
      overlap.max.x += target.bounds.max.x === overlap.max.x ? margin : 0
      overlap.max.y += target.bounds.max.y === overlap.max.y ? margin : 0
    }

    if (source.bounds.intersectsBox(target.bounds)) {
      const overlap = target.bounds.clone().intersect(source.bounds)
      adjustOverlapMargins(overlap)
      for (let { y } = overlap.min; y < overlap.max.y; y++) {
        // const globalStartPos = new Vector3(x, 0, overlap.min.y)
        const globalStartPos = new Vector2(overlap.min.x, y)
        const targetLocalStartPos = target.toLocalPos(globalStartPos)
        const sourceLocalStartPos = source.toLocalPos(globalStartPos)
        let targetIndex = target.getIndex(targetLocalStartPos)
        let sourceIndex = source.getIndex(sourceLocalStartPos)
        for (let { x } = overlap.min; x < overlap.max.x; x++) {
          const sourceVal = source.rawData[sourceIndex]
          if (sourceVal) {
            target.rawData[targetIndex] = sourceVal
          }
          sourceIndex++
          targetIndex++
        }
      }
    }
  }

  decodeBlockData(rawData: number) {
    const shift = BitAllocation
    const level =
      (rawData >> (shift.biome + shift.landscapeIndex + shift.flags)) & ((1 << shift.level) - 1)
    const biomeNum = (rawData >> (shift.landscapeIndex + shift.flags)) & ((1 << shift.biome) - 1)
    const biome = ReverseBiomeNumericType[biomeNum] || BiomeType.Temperate
    const landscapeIndex = (rawData >> shift.flags) & ((1 << shift.landscapeIndex) - 1)
    const flags = rawData & ((1 << shift.flags) - 1)
    const blockData: GroundBlockData = {
      level,
      biome,
      landscapeIndex,
      flags
    }
    return blockData
  }

  encodeBlockData(groundData: GroundBlockData): number {
    const { level, biome, landscapeIndex, flags } = groundData
    const shift = BitAllocation
    let blockRawVal = level
    blockRawVal = (blockRawVal << shift.biome) | BiomeNumericType[biome]
    blockRawVal = (blockRawVal << shift.landscapeIndex) | landscapeIndex
    blockRawVal = (blockRawVal << shift.flags) | (flags || BlockMode.DEFAULT)
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

  override getLocalPosFromIndex(index: number): Vector2 {
    const y = Math.floor(index / this.extendedDims.y)-this.margin
    const x = index % this.extendedDims.x-this.margin
    return new Vector2(x, y)
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
    this.valueRange.min = patchStub.valueRange?.min || this.valueRange.min
    this.valueRange.max = patchStub.valueRange?.max || this.valueRange.max
    return this
  }

  async fillGroundData() {
    const stub: PatchStub = await WorldComputeProxy.instance.bakeGroundPatch(
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
