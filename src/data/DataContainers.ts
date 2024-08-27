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

export enum BlockMode {
  DEFAULT,
  BOARD_CONTAINER,
}

export type BlockData = {
  level: number
  type: BlockType
  mode?: BlockMode
}

export type EntityChunk = {
  bbox: Box3
  data: string[]
}

export type PatchStub = {
  key: string
  bbox: Box3
  rawDataContainer: Uint32Array
  entitiesChunks: EntityChunk[]
}

// bits allocated per block data type
// total bits required to store a block: 9+10+3 = 22 bits
const BlockDataBitAllocation = {
  level: 9, // support level values ranging from 0 to 512
  type: 10, // support up to 1024 different block types
  mode: 3, // support for 8 different block mode
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

  rawDataContainer: Uint32Array
  entitiesChunks: EntityChunk[] = []

  constructor(bbox: Box3, margin = 1) {
    this.bbox = bbox.clone()
    this.bbox.getSize(this.dimensions)
    this.margin = margin
    const { extendedDims } = this
    this.rawDataContainer = new Uint32Array(extendedDims.x * extendedDims.z)
  }

  duplicate() {
    const copy = new BlocksContainer(this.bbox)
    this.rawDataContainer.forEach((v, i) => (copy.rawDataContainer[i] = v))
    copy.entitiesChunks = this.entitiesChunks
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
    const localBox = new Box3(
      new Vector3(0),
      this.dimensions.clone(),
    )
    return localBox
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
  }
  adjustRangeBox(rangeBox: Box3, local = false) {
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
    return local ? new Box3(rangeMin, rangeMax) : new Box3(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
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

  getBlock(pos: Vector3, isLocalPos = true) {
    const localPos = isLocalPos ? pos : this.toLocalPos(pos)
    let block: Block | undefined
    if (
      localPos.x >= 0 &&
      localPos.x < this.dimensions.x &&
      localPos.z >= 0 &&
      localPos.z < this.dimensions.z
    ) {
      const blockIndex = this.getBlockIndex(localPos)
      const pos = isLocalPos ? localPos.clone() : this.toGlobalPos(localPos)
      const data = this.readBlockData(blockIndex)
      pos.y = data.level
      block = {
        pos,
        localPos,
        data,
      }
    }
    return block
  }

  setBlock(localPos: Vector3, blockType: BlockType) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const block = {
      level: localPos.y,
      type: blockType,
    }
    this.writeBlockData(blockIndex, block)
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
  *iterOverBlocks(rangeBox?: Box3, skipMargin = true) {
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
          const block: Block = {
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

  *iterEntityBlocks(entity: EntityChunk) {
    // find overlapping blocks between entity and container
    const entityBlocks = this.iterOverBlocks(entity.bbox)
    let chunk_index = 0
    // iter over entity blocks
    for (const entityBlock of entityBlocks) {
      const bufferStr = entity.data[chunk_index++]
      const buffer = bufferStr?.split(',').map(char => parseInt(char))
      const maxHeightDiff = entity.bbox.max.y - (entityBlock.pos as Vector3).y
      const entityBlockData = entityBlock
      entityBlockData.buffer = buffer?.slice(0, maxHeightDiff) || []
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

    const blockIterator = this.iterOverBlocks(undefined, false)
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
    const { rawDataContainer, entitiesChunks } = stub
    const blocksContainer = new BlocksContainer(parseThreeStub(stub.bbox))
    blocksContainer.rawDataContainer = rawDataContainer
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
    this.rawDataContainer.forEach(
      (rawVal, i) => (copy.rawDataContainer[i] = rawVal),
    )
    copy.entitiesChunks = this.entitiesChunks.map(entity => {
      const entityCopy: EntityChunk = {
        bbox: entity.bbox.clone(),
        data: entity.data.slice(),
      }
      return entityCopy
    })
    return copy
  }

  static override fromStub(patchStub: any) {
    const { rawDataContainer, entitiesChunks } = patchStub
    const bbox = parseThreeStub(patchStub.bbox)
    const patchKey = patchStub.key || computePatchKey(bbox)
    const patch = new BlocksPatch(patchKey)
    patch.rawDataContainer = rawDataContainer
    patch.entitiesChunks = entitiesChunks.map((stub: EntityChunk) => {
      const entityChunk: EntityChunk = {
        bbox: parseThreeStub(stub.bbox),
        data: stub.data,
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

  get chunkIds() {
    return ChunkFactory.default.genChunksIdsFromPatchId(this.id)
  }

  toChunks() {
    const chunks = this.chunkIds.map(chunkId => {
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

  get patchRange() {
    const rangeMin = convertPosToPatchId(this.bbox.min)
    const rangeMax = convertPosToPatchId(this.bbox.max).addScalar(1)
    const patchRange = new Box3(asVect3(rangeMin), asVect3(rangeMax))
    return patchRange
  }

  get count() {
    return Object.keys(this.patchLookup).length
  }

  get patchKeys() {
    return Object.keys(this.patchLookup)
  }

  get chunkIds() {
    return this.availablePatches.map(patch => patch.chunkIds).flat()
  }

  get availablePatches() {
    return Object.values(this.patchLookup).filter(val => val) as BlocksPatch[]
  }

  get missingPatchKeys() {
    return Object.keys(this.patchLookup).filter(
      key => !this.patchLookup[key],
    ) as PatchKey[]
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

  getBlock(blockPos: Vector3) {
    return this.findPatch(blockPos)?.getBlock(blockPos, false)
  }

  getAllPatchesEntities(skipDuplicate = true) {
    const entities: EntityChunk[] = []
    for (const patch of this.availablePatches) {
      patch.entitiesChunks.forEach(entity => {
        if (!skipDuplicate || !entities.find(ent => ent.bbox.equals(entity.bbox))) {
          entities.push(entity)
        }
      })
    }
    return entities
  }

  // *iterAllPatchesBlocks() {
  //   for (const patch of this.availablePatches) {
  //     const blocks = patch.iterOverBlocks(undefined, false, false)
  //     for (const block of blocks) {
  //       yield block
  //     }
  //   }
  // }

  // getMergedRows(zRowIndex: number) {
  //   const sortedPatchesRows = this.availablePatches
  //     .filter(
  //       patch => zRowIndex >= patch.bbox.min.z && zRowIndex <= patch.bbox.min.z,
  //     )
  //     .sort((p1, p2) => p1.bbox.min.x - p2.bbox.min.x)
  //     .map(patch => patch.getBlocksRow(zRowIndex))
  //   const mergedRows = sortedPatchesRows.reduce((arr1, arr2) => {
  //     const mergedArray = new Uint32Array(arr1.length + arr2.length)
  //     mergedArray.set(arr1)
  //     mergedArray.set(arr2, arr1.length)
  //     return mergedArray
  //   })
  //   return mergedRows
  // }

  // iterMergedRows() {
  //   const { min, max } = this.patchRange
  //   for (let zPatchIndex = min.z; zPatchIndex <= max.z; zPatchIndex++) {
  //     for (let zRowIndex = min.z; zRowIndex < max.z; zRowIndex++) {}
  //   }
  // }

  // getMergedCols(xColIndex: number) {

  // }

  // mergedLinesIteration() {
  //   const { min, max } = this.bbox
  //   for (let x = min.x; x < max.x; x++) {
  //     for (let z = min.z; z < max.z; z++) {

  //     }
  //   }
  // }

  // toMergedContainer() {
  //   const mergedBox = this.availablePatches.map(patch => patch.bbox)
  //     .reduce((merge, bbox) => merge.union(bbox), new Box3())
  //   // const mergedContainer =
  // }

  // static fromMergedContainer() {

  // }
  // mergeBlocks(blocksContainer: BlocksContainer) {
  //   // // for each patch override with blocks from blocks container
  //   this.availablePatches.forEach(patch => {
  //     const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
  //     for (const target_block of blocksIter) {
  //       const source_block = blocksContainer.getBlock(target_block.pos, false)
  //       if (source_block && source_block.pos.y > 0 && target_block.index) {
  //         let block_type = source_block.type ? BlockType.SAND : BlockType.NONE
  //         block_type =
  //           source_block.type === BlockType.TREE_TRUNK
  //             ? BlockType.TREE_TRUNK
  //             : block_type
  //         const block_level = blocksContainer.bbox.min.y // source_block?.pos.y
  //         patch.writeBlock(target_block.index, block_level, block_type)
  //         // console.log(source_block?.pos.y)
  //       }
  //     }
  //   })
  // }
}
