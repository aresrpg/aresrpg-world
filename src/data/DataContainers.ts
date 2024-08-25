import { Box3, Vector2, Vector3 } from 'three'

import { Block, PatchKey, WorldChunk } from '../common/types'
import {
  asVect3,
  computePatchKey,
  convertPosToPatchId,
  getBboxFromChunkId,
  getBboxFromPatchKey,
  parsePatchKey,
  parseThreeStub,
  serializeChunkId,
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
    const copy = new BlocksContainer(this.bbox)
    this.groundBlocks.forEach(
      (v, i) => (copy.groundBlocks[i] = v),
    )
    copy.entitiesChunks = this.entitiesChunks
    return copy
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

  toLocalPos(pos: Vector3) {
    return pos.clone().sub(this.bbox.min)
  }

  toGlobalPos(pos: Vector3) {
    return this.bbox.min.clone().add(pos)
  }

  getBlock(pos: Vector3, useLocalPos = true) {
    const localPos = useLocalPos ? pos : this.toLocalPos(pos)
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

  getBlocksRow(zRowIndex: number) {
    const rowStart = zRowIndex * this.dimensions.z
    const rowEnd = rowStart + this.dimensions.x
    const rowRawData = this.groundBlocks.slice(rowStart, rowEnd)
    return rowRawData
  }

  getBlocksCol(xColIndex: number) {

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
          const localPos = useLocalPos ? pos : this.toLocalPos(pos)
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

  *iterEntityBlocks(entity: EntityChunk) {

    // find overlapping blocks between entity and container
    const blocks_iter = this.iterOverBlocks(
      entity.bbox,
      true,
    )
    let chunk_index = 0
    // iter over entity blocks
    for (const block of blocks_iter) {
      const bufferStr = entity.data[chunk_index++]
      const buffer =
        bufferStr && bufferStr.split(',').map(char => parseInt(char))
      const entityBlockData = block
      entityBlockData.buffer = buffer || []
      yield entityBlockData
    }
    // }
  }

  containsBlock(blockPos: Vector3) {
    return (
      blockPos.x >= this.bbox.min.x &&
      blockPos.z >= this.bbox.min.z &&
      blockPos.x < this.bbox.max.x &&
      blockPos.z < this.bbox.max.z
    )
  }

  toChunk(chunkBox: Box3) {
    chunkBox = chunkBox || this.bbox
    const chunkDims = chunkBox.getSize(new Vector3())
    const chunkData = new Uint16Array(chunkDims.x * chunkDims.y * chunkDims.z)
    let totalWrittenBlocks = 0
    // const debug_mode = true

    // const is_edge = (row, col, h, patch_size) =>
    //   row === 1 || row === patch_size || col === 1 || col === patch_size
    // || h === 1
    // || h === patch_size - 2

    // const patch = PatchBlocksCache.instances.find(
    //   patch =>
    //     patch.bbox.min.x === bbox.min.x + 1 &&
    //     patch.bbox.min.z === bbox.min.z + 1 &&
    //     patch.bbox.max.x === bbox.max.x - 1 &&
    //     patch.bbox.max.z === bbox.max.z - 1 &&
    //     patch.bbox.intersectsBox(bbox),
    // )

    // multi-pass chunk filling

    const blockIterator = this.iterOverBlocks(undefined, true, false)
    // ground blocks pass
    totalWrittenBlocks += ChunkFactory.default.fillGroundData(
      blockIterator,
      chunkData,
      chunkBox,
    )
    // entities blocks pass
    for (const entity of this.entitiesChunks) {
      const entityBlocksIterator = this.iterEntityBlocks(entity)
      // overground entities pass
      totalWrittenBlocks += ChunkFactory.default.fillEntitiesData(
        entityBlocksIterator,
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
    copy.entitiesChunks = this.entitiesChunks
    return copy
  }

  static override fromStub(patchStub: any) {
    const { groundBlocks, entitiesChunks } = patchStub
    const bbox = parseThreeStub(patchStub.bbox)
    const patchKey = patchStub.key || computePatchKey(bbox)
    const patch = new BlocksPatch(patchKey)
    patch.groundBlocks = groundBlocks
    patch.entitiesChunks = entitiesChunks.map((stub: EntityChunk) => {
      const entityChunk: EntityChunk = {
        bbox: parseThreeStub(stub.bbox),
        data: stub.data
      }
      return entityChunk
    })
    patch.bbox.min.y = patchStub.bbox.min.y
    patch.bbox.max.y = patchStub.bbox.max.y
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return patch
  }

  toChunks() {
    const chunkIds = ChunkFactory.default.genChunksIdsFromPatchId(this.id)
    const chunks = chunkIds.map(chunkId => {
      const chunkBox = getBboxFromChunkId(chunkId, WorldConfig.patchSize)
      const chunk = super.toChunk(chunkBox)
      const worldChunk: WorldChunk = {
        key: serializeChunkId(chunkId),
        data: chunk.data,
      }
      return worldChunk
    })
    return chunks
  }
}

export class PatchContainer {
  bbox: Box3 = new Box3()
  patchLookup: Record<string, BlocksPatch | null> = {}

  get patchRange() {
    const rangeMin = convertPosToPatchId(this.bbox.min)
    const rangeMax = convertPosToPatchId(this.bbox.max).addScalar(1)
    const patchRange = new Box3(asVect3(rangeMin), asVect3(rangeMax))
    return patchRange
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
    const { min, max } = this.patchRange
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

  getMergedRows(zRowIndex: number) {
    const sortedPatchesRows = this.availablePatches
      .filter(patch => zRowIndex >= patch.bbox.min.z && zRowIndex <= patch.bbox.min.z)
      .sort((p1, p2) => p1.bbox.min.x - p2.bbox.min.x)
      .map(patch => patch.getBlocksRow(zRowIndex))
    const mergedRows = sortedPatchesRows.reduce((arr1, arr2) => {
      const mergedArray = new Uint32Array(arr1.length + arr2.length)
      mergedArray.set(arr1)
      mergedArray.set(arr2, arr1.length)
      return mergedArray
    })
    return mergedRows
  }

  iterMergedRows() {
    const { min, max } = this.patchRange
    for (let zPatchIndex = min.z; zPatchIndex <= max.z; zPatchIndex++) {
      for (let zRowIndex = min.z; zRowIndex < max.z; zRowIndex++) {

      }
    }
  }

  getMergedCols(xColIndex: number) {

  }

  mergedLinesIteration() {
    const { min, max } = this.bbox
    for (let x = min.x; x < max.x; x++) {
      for (let z = min.z; z < max.z; z++) {

      }
    }
  }

  toMergedContainer() {
    const mergedBox = this.availablePatches.map(patch => patch.bbox)
      .reduce((merge, bbox) => merge.union(bbox), new Box3())
    // const mergedContainer = 
  }

  static fromMergedContainer() {

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

