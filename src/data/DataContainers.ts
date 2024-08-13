import { Box3, Vector2, Vector3 } from 'three'
import { PatchKey } from '../common/types'
import { genChunkIds, parseThreeStub, vect2ToVect3 } from '../common/utils'
import { ChunkTools } from '../index'
import { BlockType } from '../procgen/Biome'


export type BlockData = {
  pos: Vector3
  type: BlockType
  index?: number
  localPos?: Vector3
  buffer?: BlockType[]
}

export type BlockStub = {
  level: number
  type: BlockType
}

export type EntityChunk = {
  bbox: Box3
  data: string[]
}

export type PatchStub = {
  key: string
  bbox: Box3
  groundBlocks: {
    type: Uint16Array
    level: Uint16Array
  }
  entitiesChunks: EntityChunk[]
}

export type BlockIteratorRes = IteratorResult<BlockData, void>

/**
 * GenericBlocksContainer
 * multi purpose blocks container
 */
export class BlocksContainer {
  bbox: Box3
  dimensions = new Vector3()
  margin = 0

  groundBlocks: {
    type: Uint16Array,
    level: Uint16Array,
  }

  entitiesChunks: EntityChunk[] = []

  constructor(bbox: Box3, margin = 1) {
    this.bbox = bbox.clone()
    this.bbox.getSize(this.dimensions)
    this.margin = margin
    const { extendedDims } = this
    this.groundBlocks = {
      type: new Uint16Array(extendedDims.x * extendedDims.z),
      level: new Uint16Array(extendedDims.x * extendedDims.z),
    }
  }

  duplicate() {
    const duplicate = new BlocksContainer(this.bbox)
    this.groundBlocks.level.forEach((v, i) => duplicate.groundBlocks.level[i] = v)
    this.groundBlocks.type.forEach((v, i) => duplicate.groundBlocks.type[i] = v)
    return duplicate
  }

  writeBlockAtIndex(
    blockIndex: number,
    blockLevel: number,
    blockType: BlockType,
  ) {
    this.groundBlocks.level[blockIndex] = blockLevel
    this.groundBlocks.type[blockIndex] = blockType
  }

  get extendedBox() {
    return this.bbox.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBox.getSize(new Vector3())
  }

  get localExtendedBox() {
    const bbox = new Box3(new Vector3(0), this.dimensions.clone()).expandByScalar(this.margin)
    return bbox
  }

  adaptCustomBox(bbox: Box3, useLocalPos = false) {
    const { patchSize } = BlocksPatch
    const bmin = new Vector3(
      Math.max(Math.floor(bbox.min.x), useLocalPos ? 0 : this.bbox.min.x),
      0,
      Math.max(Math.floor(bbox.min.z), useLocalPos ? 0 : this.bbox.min.z),
    )
    const bmax = new Vector3(
      Math.min(Math.floor(bbox.max.x), useLocalPos ? patchSize : this.bbox.max.x),
      0,
      Math.min(Math.floor(bbox.max.z), useLocalPos ? patchSize : this.bbox.max.z),
    )
    return new Box3(bmin, bmax)
  }

  getBlockIndex(localPos: Vector3) {
    return (localPos.x + this.margin) * this.extendedDims.x + localPos.z + this.margin
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
      pos.y = this.groundBlocks.level[blockIndex] || 0
      const type = this.groundBlocks.type[blockIndex]
      block = {
        pos,
        type,
      }
    }
    return block
  }

  setBlock(localPos: Vector3, blockType: BlockType) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const blockLevel = localPos.y
    this.writeBlockAtIndex(blockIndex, blockLevel, blockType)
    // const levelMax = blockLevel + blockData.over.length
    // bbox.min.y = Math.min(bbox.min.y, levelMax)
    // bbox.max.y = Math.max(bbox.max.y, levelMax)
  }

  *iterOverBlocks(customBox?: Box3, useLocalPos = false, skipMargin = true) {
    const bbox = customBox ? this.adaptCustomBox(customBox, useLocalPos) :
      useLocalPos ? this.localExtendedBox : this.extendedBox

    const isMarginBlock = ({ x, z }: { x: number, z: number }) => !customBox && this.margin > 0
      && (x === bbox.min.x || x === bbox.max.x - 1 || z === bbox.min.z || z === bbox.max.z - 1)

    let index = 0
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        const pos = new Vector3(x, 0, z)
        if (!skipMargin || !isMarginBlock(pos)) {
          const localPos = useLocalPos ? pos : this.getLocalPos(pos)
          index = customBox ? this.getBlockIndex(localPos) : index
          const type = this.groundBlocks.type[index] || BlockType.NONE
          const level = this.groundBlocks.level[index] || 0
          pos.y = level
          localPos.y = level
          const blockData: BlockData = {
            index,
            pos,
            localPos,
            type,
          }
          yield blockData
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
      blockPos.z < this.bbox.max.z)
  }

  toChunk() {
    return ChunkTools.makeChunkFromBox(this, this.bbox)
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
  // eslint-disable-next-line no-use-before-define
  // static cache: BlocksPatch[] = []
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()

  coords: Vector2
  key: string

  constructor(patchKey: string) {
    super(BlocksPatch.getBboxFromPatchKey(patchKey))//.expandByScalar(1))
    this.key = patchKey
    const patchCoords = BlocksPatch.parsePatchKey(patchKey)
    this.coords = new Vector2(patchCoords.x, patchCoords.z)
  }

  override duplicate() {
    const duplicate = new BlocksPatch(this.key)
    this.groundBlocks.level.forEach((v, i) => duplicate.groundBlocks.level[i] = v)
    this.groundBlocks.type.forEach((v, i) => duplicate.groundBlocks.type[i] = v)
    return duplicate
  }

  static override fromStub(patchStub: any) {
    const { groundBlocks, entitiesChunks } = patchStub
    const bbox = parseThreeStub(patchStub.bbox)
    const patchKey = patchStub.key || this.computePatchKey(bbox)
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

  static asPatchCoords = (position: Vector3) => {
    const { patchSize } = this
    const orig_x = Math.floor(position.x / patchSize);
    const orig_z = Math.floor(position.z / patchSize);
    const patchCoords = new Vector2(orig_x, orig_z);
    return patchCoords
  }

  static parsePatchKey = (patchKey: string) => {
    const patchOrigin = new Vector3(
      parseInt(patchKey.split('_')[1] as string),
      0,
      parseInt(patchKey.split('_')[2] as string),
    )
    return patchOrigin
  }

  static getBboxFromPatchKey = (patchKey: string) => {
    const { patchSize } = BlocksPatch
    const patchCoords = BlocksPatch.parsePatchKey(patchKey)
    const bmin = patchCoords.clone().multiplyScalar(patchSize)
    const bmax = patchCoords.clone().addScalar(1).multiplyScalar(patchSize)
    bmax.y = 512
    const bbox = new Box3(bmin, bmax)
    return bbox
  }

  static computePatchKey(input: Box3 | Vector3 | Vector2) {
    const inputCopy: Vector3 | Box3 =
      input instanceof Vector2
        ? new Vector3(input.x, 0, input.y)
        : input.clone()
    const point =
      inputCopy instanceof Box3
        ? (inputCopy as Box3).getCenter(new Vector3())
        : (inputCopy as Vector3).clone()

    const patchOrigin = this.asPatchCoords(point)
    const { x, y } = patchOrigin
    const patchKey = `patch_${x}_${y}`
    return patchKey
  }

  toChunks(yMin: number, yMax: number) {
    const chunkIds = genChunkIds(
      this.coords,
      yMin,
      yMax,
    )
    const chunks = chunkIds.map(chunkId =>
      ChunkTools.makeChunkFromId(this, chunkId),
    )
    return chunks
  }
}

export class PatchContainer {
  bbox: Box3 = new Box3()
  patchLookup: Record<string, BlocksPatch | null> = {}

  get patchIdsRange() {
    const rangeMin = BlocksPatch.asPatchCoords(this.bbox.min)
    const rangeMax = BlocksPatch.asPatchCoords(this.bbox.max).addScalar(1)
    const patchIdsRange = new Box3(vect2ToVect3(rangeMin), vect2ToVect3(rangeMax))
    return patchIdsRange
  }

  init(bbox: Box3) {
    this.bbox = bbox
    this.patchLookup = {}
    // const halfDimensions = this.bbox.getSize(new Vector3()).divideScalar(2)
    // const range = BlocksPatch.asPatchCoords(halfDimensions)
    // const center = this.bbox.getCenter(new Vector3())
    // const origin = BlocksPatch.asPatchCoords(center)
    const { min, max } = this.patchIdsRange
    for (let x = min.x; x < max.x; x++) {
      for (let z = min.z; z < max.z; z++) {
        const patchKey = 'patch_' + x + '_' + z;
        this.patchLookup[patchKey] = null
      }
    }
  }

  get availablePatches() {
    return Object.values(this.patchLookup).filter(val => val) as BlocksPatch[]
  }

  get missingPatchKeys() {
    return Object.keys(this.patchLookup).filter(key => !this.patchLookup[key]) as PatchKey[]
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
    patches.filter(patch => this.patchLookup[patch.key] !== undefined)
      .forEach(patch => {
        this.patchLookup[patch.key] = cloneObjects ? patch.duplicate() : patch
        min.y = Math.min(patch.bbox.min.y, min.y)
        max.y = Math.max(patch.bbox.max.y, max.y)
      })
  }

  mergeBlocks(blocksContainer: BlocksContainer) {
    // for each patch override with blocks from blocks container
    this.availablePatches.forEach(patch => {
      const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
      for (const target_block of blocksIter) {
        const source_block = blocksContainer.getBlock(target_block.pos, false)
        if (source_block && source_block.pos.y > 0 && target_block.index) {
          let block_type = source_block.type ? BlockType.SAND : BlockType.NONE
          block_type = source_block.type === BlockType.TREE_TRUNK ? BlockType.TREE_TRUNK : block_type
          const block_level = blocksContainer.bbox.min.y//source_block?.pos.y
          patch.writeBlockAtIndex(target_block.index, block_level, block_type)
          // console.log(source_block?.pos.y)
        }
      }
    })
  }

  diffWithPatchContainer(otherContainer: PatchContainer) {
    const patchKeysDiff: Record<string, boolean> = {}
    // added keys e.g. keys in current container but not found in other
    Object.keys(this.patchLookup)
      .filter(patchKey => otherContainer.patchLookup[patchKey] === undefined)
      .forEach(patchKey => patchKeysDiff[patchKey] = true)
    // missing keys e.g. found in other container but not in current
    Object.keys(otherContainer.patchLookup)
      .filter(patchKey => this.patchLookup[patchKey] === undefined)
      .forEach(patchKey => patchKeysDiff[patchKey] = false)
    return patchKeysDiff
  }

  toChunks(yMin: number, yMax: number) {
    const chunksExport = this.availablePatches.map(patch => patch.toChunks(yMin, yMax)).flat()
    return chunksExport
  }

  findPatch(blockPos: Vector3) {
    // const point = new Vector3(
    //   inputPoint.x,
    //   0,
    //   inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    // )

    const res = this.availablePatches.find(patch => patch.containsBlock(blockPos))
    return res
  }
}
