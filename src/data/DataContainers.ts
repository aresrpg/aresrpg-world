import { Box3, Vector2, Vector3 } from 'three'

import { Block, PatchKey } from '../common/types'
import {
  asVect3,
  computePatchKey,
  convertPosToPatchId,
  getBboxFromPatchKey,
  parsePatchKey,
  parseThreeStub,
} from '../common/utils'
import { BlockType } from '../procgen/Biome'
import { WorldConfig } from '../config/WorldConfig'
import { ChunkFactory } from '../index'

export type BlockData = {
  level: number
  type: BlockType
  mode?: BlockMode
}

export enum BlockMode {
  DEFAULT,
  BOARD_CONTAINER
}

export type EntityChunk = {
  bbox: Box3
  data: string[]
}

export type PatchStub = {
  key: string
  bbox: Box3
  groundBlocks: Uint32Array
  entitiesChunks: EntityChunk[]
}

// bits allocated per block data type
// total bits required to store a block: 9+10+3 = 22 bits
const BlockDataBitAllocation = {
  level: 9,  // support level values ranging from 0 to 512
  type: 10,   // support up to 1024 different block types
  mode: 3,    // support for 8 different block mode
}

export type BlockIteratorRes = IteratorResult<Block, void>

/**
 * GenericBlocksContainer
 * multi purpose blocks container
 */
export class BlocksContainer {
  bbox: Box3
  dimensions = new Vector3()
  margin = 0

  groundBlocks: Uint32Array
  entitiesChunks: EntityChunk[] = []

  constructor(bbox: Box3, margin = 1) {
    this.bbox = bbox.clone()
    this.bbox.getSize(this.dimensions)
    this.margin = margin
    const { extendedDims } = this
    this.groundBlocks = new Uint32Array(extendedDims.x * extendedDims.z)
  }

  duplicate() {
    const duplicate = new BlocksContainer(this.bbox)
    this.groundBlocks.forEach(
      (v, i) => (duplicate.groundBlocks[i] = v),
    )
    return duplicate
  }

  decodeBlockData(rawData: number): BlockData {
    const shift = BlockDataBitAllocation
    const level = (rawData >> (shift.type + shift.mode)) & ((1 << shift.level) - 1);  // Extract 9 bits for level
    const type = (rawData >> shift.mode) & ((1 << shift.type) - 1);  // Extract 10 bits for type
    const mode = rawData & ((1 << shift.mode) - 1);  // Extract 3 bits for mode
    const blockData: BlockData = {
      level, type, mode
    }
    return blockData
  }

  encodeBlockData(blockData: BlockData): number {
    const { level, type, mode } = blockData
    const shift = BlockDataBitAllocation
    let blockRawVal = level
    blockRawVal = blockRawVal << shift.type | type
    blockRawVal = blockRawVal << shift.mode | (mode || BlockMode.DEFAULT)
    return blockRawVal
  }

  readBlockData(blockIndex: number): BlockData {
    const blockRawData = this.groundBlocks[blockIndex]
    const blockData = this.decodeBlockData(blockRawData)
    return blockData
  }

  writeBlockData(
    blockIndex: number,
    blockData: BlockData
  ) {
    this.groundBlocks[blockIndex] = this.encodeBlockData(blockData)
  }

  get extendedBox() {
    return this.bbox.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBox.getSize(new Vector3())
  }

  get localExtendedBox() {
    const bbox = new Box3(
      new Vector3(0),
      this.dimensions.clone(),
    ).expandByScalar(this.margin)
    return bbox
  }

  adaptCustomBox(bbox: Box3, useLocalPos = false) {
    const { patchSize } = WorldConfig
    const bmin = new Vector3(
      Math.max(Math.floor(bbox.min.x), useLocalPos ? 0 : this.bbox.min.x),
      0,
      Math.max(Math.floor(bbox.min.z), useLocalPos ? 0 : this.bbox.min.z),
    )
    const bmax = new Vector3(
      Math.min(
        Math.floor(bbox.max.x),
        useLocalPos ? patchSize : this.bbox.max.x,
      ),
      0,
      Math.min(
        Math.floor(bbox.max.z),
        useLocalPos ? patchSize : this.bbox.max.z,
      ),
    )
    return new Box3(bmin, bmax)
  }

  getBlockIndex(localPos: Vector3) {
    return (
      (localPos.x + this.margin) * this.extendedDims.x +
      localPos.z +
      this.margin
    )
  }

  getLocalPos(pos: Vector3) {
    return pos.clone().sub(this.bbox.min)
  }

  getBlock(pos: Vector3, useLocalPos = true) {
    const localPos = useLocalPos ? pos : this.getLocalPos(pos)
    let block
    if (
      localPos.x >= 0 &&
      localPos.x < this.dimensions.x &&
      localPos.z >= 0 &&
      localPos.z < this.dimensions.z
    ) {
      const blockIndex = this.getBlockIndex(localPos)
      const pos = localPos.clone()
      const { level, type } = this.readBlockData(blockIndex)
      pos.y = level
      block = {
        pos,
        type,
      }
    }
    return block
  }

  setBlock(localPos: Vector3, blockType: BlockType) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const block = {
      level: localPos.y,
      type: blockType
    }
    this.writeBlockData(blockIndex, block)
    // const levelMax = blockLevel + blockData.over.length
    // bbox.min.y = Math.min(bbox.min.y, levelMax)
    // bbox.max.y = Math.max(bbox.max.y, levelMax)
  }

  *iterOverBlocks(customBox?: Box3, useLocalPos = false, skipMargin = true) {
    const bbox = customBox
      ? this.adaptCustomBox(customBox, useLocalPos)
      : useLocalPos
        ? this.localExtendedBox
        : this.extendedBox

    const isMarginBlock = ({ x, z }: { x: number; z: number }) =>
      !customBox &&
      this.margin > 0 &&
      (x === bbox.min.x ||
        x === bbox.max.x - 1 ||
        z === bbox.min.z ||
        z === bbox.max.z - 1)

    let index = 0
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        const pos = new Vector3(x, 0, z)
        if (!skipMargin || !isMarginBlock(pos)) {
          const localPos = useLocalPos ? pos : this.getLocalPos(pos)
          index = customBox ? this.getBlockIndex(localPos) : index
          const blockData = this.readBlockData(index) || BlockType.NONE
          pos.y = blockData.level
          localPos.y = blockData.level
          const block: Block = {
            index,
            pos,
            localPos,
            data: blockData,
          }
          yield block
        }
        index++
      }
    }
  }

  containsBlock(blockPos: Vector3) {
    return (
      blockPos.x >= this.bbox.min.x &&
      blockPos.z >= this.bbox.min.z &&
      blockPos.x < this.bbox.max.x &&
      blockPos.z < this.bbox.max.z
    )
  }

  toChunk() {
    return ChunkFactory.default.makeChunkFromBox(this, this.bbox)
  }

  static fromStub(stub: any) {
    const { groundBlocks, entitiesChunks } = stub
    const blocksContainer = new BlocksContainer(parseThreeStub(stub.bbox))
    blocksContainer.groundBlocks = groundBlocks
    blocksContainer.entitiesChunks = entitiesChunks
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return blocksContainer
  }
}

/**
 * Patch
 */
export class BlocksPatch extends BlocksContainer {
  id: Vector2
  key: string

  constructor(patchKey: string) {
    super(getBboxFromPatchKey(patchKey)) // .expandByScalar(1))
    this.key = patchKey
    this.id = parsePatchKey(patchKey)
  }

  override duplicate() {
    const copy = new BlocksPatch(this.key)
    this.groundBlocks.forEach((rawVal, i) => copy.groundBlocks[i] = rawVal)
    return copy
  }

  static override fromStub(patchStub: any) {
    const { groundBlocks, entitiesChunks } = patchStub
    const bbox = parseThreeStub(patchStub.bbox)
    const patchKey = patchStub.key || computePatchKey(bbox)
    const patch = new BlocksPatch(patchKey)
    patch.groundBlocks = groundBlocks
    patch.entitiesChunks = entitiesChunks
    patch.bbox.min.y = patchStub.bbox.min.y
    patch.bbox.max.y = patchStub.bbox.max.y
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return patch
  }

  toChunks() {
    return ChunkFactory.default.genChunksFromPatch(this)
  }
}

export class PatchContainer {
  bbox: Box3 = new Box3()
  patchLookup: Record<string, BlocksPatch | null> = {}

  get patchIdsRange() {
    const rangeMin = convertPosToPatchId(this.bbox.min)
    const rangeMax = convertPosToPatchId(this.bbox.max).addScalar(1)
    const patchIdsRange = new Box3(asVect3(rangeMin), asVect3(rangeMax))
    return patchIdsRange
  }

  initFromBoxAndMask(
    bbox: Box3,
    patchBboxMask = (patchBbox: Box3) => patchBbox,
  ) {
    this.bbox = bbox
    this.patchLookup = {}
    // const halfDimensions = this.bbox.getSize(new Vector3()).divideScalar(2)
    // const range = BlocksPatch.asPatchCoords(halfDimensions)
    // const center = this.bbox.getCenter(new Vector3())
    // const origin = BlocksPatch.asPatchCoords(center)
    const { min, max } = this.patchIdsRange
    for (let { x } = min; x < max.x; x++) {
      for (let { z } = min; z < max.z; z++) {
        const patchKey = `${x}:${z}`
        const patchBox = getBboxFromPatchKey(patchKey)
        if (patchBboxMask(patchBox)) {
          this.patchLookup[patchKey] = null
        }
      }
    }
  }

  get availablePatches() {
    return Object.values(this.patchLookup).filter(val => val) as BlocksPatch[]
  }

  get missingPatchKeys() {
    return Object.keys(this.patchLookup).filter(
      key => !this.patchLookup[key],
    ) as PatchKey[]
  }

  get count() {
    return Object.keys(this.patchLookup).length
  }

  get patchKeys() {
    return Object.keys(this.patchLookup)
  }

  // autoFill(fillingVal=0){
  //   this.patchKeys.forEach(key=>this.patchLookup[key] = new BlocksPatch(key))
  //   this.availablePatches.forEach(patch=>patch.iterOverBlocks)
  // }

  populateFromExisting(patches: BlocksPatch[], cloneObjects = false) {
    const { min, max } = this.bbox
    patches
      .filter(patch => this.patchLookup[patch.key] !== undefined)
      .forEach(patch => {
        this.patchLookup[patch.key] = cloneObjects ? patch.duplicate() : patch
        min.y = Math.min(patch.bbox.min.y, min.y)
        max.y = Math.max(patch.bbox.max.y, max.y)
      })
  }

  mergeBlocks(blocksContainer: BlocksContainer) {
    // // for each patch override with blocks from blocks container
    // this.availablePatches.forEach(patch => {
    //   const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
    //   for (const target_block of blocksIter) {
    //     const source_block = blocksContainer.getBlock(target_block.pos, false)
    //     if (source_block && source_block.pos.y > 0 && target_block.index) {
    //       let block_type = source_block.type ? BlockType.SAND : BlockType.NONE
    //       block_type =
    //         source_block.type === BlockType.TREE_TRUNK
    //           ? BlockType.TREE_TRUNK
    //           : block_type
    //       const block_level = blocksContainer.bbox.min.y // source_block?.pos.y
    //       patch.writeBlock(target_block.index, block_level, block_type)
    //       // console.log(source_block?.pos.y)
    //     }
    //   }
    // })
  }

  compareWith(otherContainer: PatchContainer) {
    const patchKeysDiff: Record<string, boolean> = {}
    // added keys e.g. keys in current container but not found in other
    Object.keys(this.patchLookup)
      .filter(patchKey => otherContainer.patchLookup[patchKey] === undefined)
      .forEach(patchKey => (patchKeysDiff[patchKey] = true))
    // missing keys e.g. found in other container but not in current
    Object.keys(otherContainer.patchLookup)
      .filter(patchKey => this.patchLookup[patchKey] === undefined)
      .forEach(patchKey => (patchKeysDiff[patchKey] = false))
    return patchKeysDiff
  }

  toChunks() {
    const exportedChunks = this.availablePatches
      .map(patch => patch.toChunks())
      .flat()
    return exportedChunks
  }

  findPatch(blockPos: Vector3) {
    // const point = new Vector3(
    //   inputPoint.x,
    //   0,
    //   inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    // )

    const res = this.availablePatches.find(patch =>
      patch.containsBlock(blockPos),
    )
    return res
  }
}

