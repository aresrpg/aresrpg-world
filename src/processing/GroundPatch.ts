import { Box2, Vector2, Vector3 } from 'three'

import { GroundBlock, LandscapesConf, PatchBlock, PatchBoundId, PatchKey } from '../utils/types'
import { asVect3, asVect2 } from '../utils/convert'
import { BlockMode, Heightmap, WorldEnv } from '../index'
import {
  Biome,
  BiomeInfluence,
  BiomeNumericType,
  BiomeType,
  BlockType,
  ReverseBiomeNumericType,
} from '../procgen/Biome'

import { PatchBase, PatchDataContainer, PatchStub } from '../datacontainers/PatchBase'
import { getPatchBoundingPoints } from '../utils/spatial'
import { bilinearInterpolation } from '../utils/math'

export type PatchBoundingBiomes = Record<PatchBoundId, BiomeInfluence>

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
export class GroundPatch
  extends PatchBase<number>
  implements PatchDataContainer {
  biomeInfluence: BiomeInfluence | PatchBoundingBiomes | undefined
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

  preprocess() {
    this.biomeInfluence = this.getBiomeInfluence()

    //   const stub: GroundPatchStub =
    //   await WorldComputeProxy.current.bakeGroundPatch(this.key || this.bounds)
    // this.valueRange = stub.valueRange || this.valueRange
    // this.rawData.set(stub.rawData)
    // this.isEmpty = false

  }

  getBiomeInfluence() {
    const { xMyM, xMyP, xPyM, xPyP } = PatchBoundId
    // eval biome at patch corners
    const equals = (v1: BiomeInfluence, v2: BiomeInfluence) => {
      const different = Object.keys(v1)
        // .map(k => parseInt(k) as BiomeType)
        .find(k => v1[k as BiomeType] !== v2[k as BiomeType])
      return !different
    }
    const boundsPoints = getPatchBoundingPoints(this.bounds)
    const boundsInfluences = {} as PatchBoundingBiomes
      ;[xMyM, xMyP, xPyM, xPyP].map(key => {
        const boundPos = boundsPoints[key] as Vector2
        const biomeInfluence = Biome.instance.getBiomeInfluence(asVect3(boundPos))
        boundsInfluences[key] = biomeInfluence
        // const block = computeGroundBlock(asVect3(pos), biomeInfluence)
        return biomeInfluence
      })
    const allEquals =
      equals(boundsInfluences[xMyM], boundsInfluences[xPyM]) &&
      equals(boundsInfluences[xMyM], boundsInfluences[xMyP]) &&
      equals(boundsInfluences[xMyM], boundsInfluences[xPyP])
    return allEquals ? boundsInfluences[xMyM] : boundsInfluences
  }

  getBlockBiome(
    blockPos: Vector2,
  ) {
    if (
      (this.biomeInfluence as PatchBoundingBiomes)[PatchBoundId.xMyM] &&
      WorldEnv.current.settings.useBiomeBilinearInterpolation
    ) {
      return bilinearInterpolation(
        blockPos,
        this.bounds,
        this.biomeInfluence as PatchBoundingBiomes,
      ) as BiomeInfluence
    }
    return this.biomeInfluence as BiomeInfluence
  }

  computeGroundBlock = (
    blockPos: Vector3,
  ) => {
    const biomeInfluence = this.getBlockBiome(asVect2(blockPos))
    // const biomeInfluenceBis = Biome.instance.getBiomeInfluence(blockPos)
    const biomeType = Biome.instance.getBiomeType(biomeInfluence)
    const rawVal = Heightmap.instance.getRawVal(blockPos)
    const nominalConf = Biome.instance.getBiomeConf(
      rawVal,
      biomeType,
    ) as LandscapesConf
    // const confIndex = Biome.instance.getConfIndex(currLevelConf.key)
    // const confData = Biome.instance.indexedConf.get(confIndex)
    const level = Heightmap.instance.getGroundLevel(
      blockPos,
      rawVal,
      biomeInfluence,
    )
    const isCavern = false // DensityVolume.instance.getBlockType(blockPos) === BlockType.NONE
    let usedConf = nominalConf // isCavern ? nominalConf : nominalConf
    // let isEmpty = isCavern
    // while (isEmpty && level > 0) {
    //   blockPos.y = level--
    //   isEmpty = DensityVolume.instance.getBlockType(blockPos) === BlockType.NONE
    // }
    // const pos = new Vector3(blockPos.x, level, blockPos.z)
    if (!isCavern && nominalConf.next?.data) {
      const variation = Biome.instance.posRandomizer.eval(
        blockPos.clone().multiplyScalar(50),
      ) // Math.cos(0.1 * blockPos.length()) / 100
      const min = new Vector2(nominalConf.data.x, nominalConf.data.y)
      const max = new Vector2(nominalConf.next.data.x, nominalConf.next.data.y)
      const rangeBox = new Box2(min, max)
      const dims = rangeBox.getSize(new Vector2())
      // const slope = dims.y / dims.x
      const distRatio = (rawVal - min.x) / dims.x
      const threshold = 4 * distRatio
      usedConf =
        variation > threshold && nominalConf.prev?.data.type
          ? nominalConf.prev
          : nominalConf
    }

    if (isNaN(usedConf.data.type)) {
      console.log(nominalConf.data)
    }

    // }
    // level += offset
    const flags = isCavern ? 0b010 : 0
    const groundBlockData: GroundBlockData = {
      level,
      biome: biomeType,
      landscapeIndex: usedConf.index,
      flags,
    }
    return groundBlockData
  }

  bake() {
    this.preprocess()
    const { valueRange } = this
    const blocks = this.iterBlocksQuery(undefined, false)
    let blockIndex = 0
    for (const block of blocks) {
      // EXPERIMENTAL: is it faster to perform bilinear interpolation rather
      // than sampling biome for each block?
      // if biome is the same at each patch corners, no need to interpolate
      const blockData = this.computeGroundBlock(block.pos)
      valueRange.min = Math.min(valueRange.min, blockData.level)
      valueRange.max = Math.max(valueRange.max, blockData.level)
      this.writeBlockData(blockIndex, blockData)
      blockIndex++
    }
    this.isEmpty = false
    // return groundPatch
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