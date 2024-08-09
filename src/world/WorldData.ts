import { Box3, Vector2, Vector3 } from 'three'
import { parseThreeStub } from '../common/utils'

import { BlockType } from '../procgen/Biome'

export type BlockData = {
  pos: Vector3
  type: BlockType
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
    this.bbox = bbox
    this.bbox.getSize(this.dimensions)
    this.margin = margin
    const { extendedDims } = this
    this.groundBlocks = {
      type: new Uint16Array(extendedDims.x * extendedDims.z),
      level: new Uint16Array(extendedDims.x * extendedDims.z),
    }
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

  getBlockIndex(localPos: Vector3) {
    return (localPos.x + this.margin) * this.extendedDims.x + localPos.z + this.margin
  }

  getLocalPos(pos: Vector3) {
    return pos.clone().sub(this.bbox.min)
  }

  getBlock(localPos: Vector3) {
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

  *getBlocks(bbox: Box3, useLocalPos = false) {
    const { patchSize } = BlocksPatch
    const bmin = new Vector3(
      Math.max(bbox.min.x, useLocalPos ? 0 : this.bbox.min.x),
      0,
      Math.max(bbox.min.z, useLocalPos ? 0 : this.bbox.min.z),
    )
    const bmax = new Vector3(
      Math.min(bbox.max.x, useLocalPos ? patchSize : this.bbox.max.x),
      0,
      Math.min(bbox.max.z, useLocalPos ? patchSize : this.bbox.max.z),
    )

    for (let { x } = bmin; x < bmax.x; x++) {
      for (let { z } = bmin; z < bmax.z; z++) {
        const pos = new Vector3(x, 0, z)
        const localPos = useLocalPos ? pos : this.getLocalPos(pos)
        const index = this.getBlockIndex(localPos)
        const type = this.groundBlocks.type[index] || BlockType.NONE
        const level = this.groundBlocks.level[index] || 0
        pos.y = level
        localPos.y = level
        const blockData: BlockData = {
          pos,
          localPos,
          type,
        }
        yield blockData
      }
    }
  }

  *iterBlocks(useLocalCoords?: boolean, skipMargins = true) {
    const bbox = useLocalCoords
      ? new Box3(new Vector3(0), this.dimensions.clone())
      : this.bbox.clone()
    bbox.expandByScalar(this.margin)

    let index = 0
    const isMargin = (x: number, z: number) => this.margin > 0 && (x === bbox.min.x || x === bbox.max.x - 1 || z === bbox.min.z || z === bbox.max.z - 1)

    for (let x = bbox.min.x; x < bbox.max.x; x++) {
      for (let z = bbox.min.z; z < bbox.max.z; z++) {
        if (!skipMargins || !isMargin(x, z)) {
          const pos = new Vector3(x, 0, z)
          // highlight patch edges
          // blockType = x === bbox.min.x ? BlockType.MUD : blockType
          // blockType = x === bbox.max.x - 1 ? BlockType.ROCK : blockType
          // blockType = z === bbox.min.z ? BlockType.MUD : blockType
          // blockType = z === bbox.max.z - 1 ? BlockType.ROCK : blockType
          const type = this.groundBlocks.type[index] || BlockType.NONE
          const level = this.groundBlocks?.level[index] || 0
          pos.y = level
          const blockData = {
            index,
            pos,
            type,
          }
          yield blockData
        }
        index++
      }
    }
  }

  static fromStub(stub: BlocksContainer) {
    const { groundBlocks, entitiesChunks } = stub
    const blocksContainer = new BlocksContainer(stub.bbox)
    blocksContainer.groundBlocks = groundBlocks
    blocksContainer.entitiesChunks = entitiesChunks
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return blocksContainer
  }

}

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

  static override fromStub(patchStub: BlocksPatch) {
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
}
