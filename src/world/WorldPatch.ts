import { Box3, Vector2, Vector3 } from 'three'

import { BlockType } from '../procgen/Biome'

export type BlockData = {
  pos: Vector3
  type: BlockType
  localPos?: Vector3
  buffer?: BlockType[]
}

export type EntityChunk = {
  bbox: Box3
  data: string[]
}

export type PatchStub = {
  key: string
  groundBlocks: {
    type: Uint16Array
    level: Uint16Array
  }
  entitiesChunks: EntityChunk[]
}

export type BlockIteratorRes = IteratorResult<BlockData, void>

export class BlocksPatch {
  // eslint-disable-next-line no-use-before-define
  // static cache: BlocksPatch[] = []
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()

  coords: Vector2
  key: string
  bbox: Box3
  dimensions = new Vector3()

  groundBlocks = {
    type: new Uint16Array(Math.pow(BlocksPatch.patchSize, 2)),
    level: new Uint16Array(Math.pow(BlocksPatch.patchSize, 2)),
  }

  entitiesChunks: EntityChunk[] = []

  constructor(patchKey: string) {
    const { patchSize } = BlocksPatch
    const patchOrigin = new Vector3(
      parseInt(patchKey.split('_')[1] as string),
      0,
      parseInt(patchKey.split('_')[2] as string),
    )
    this.coords = new Vector2(patchOrigin.x, patchOrigin.z)
    const bmin = patchOrigin.clone().multiplyScalar(patchSize)
    const bmax = patchOrigin.clone().addScalar(1).multiplyScalar(patchSize)
    bmax.y = 512
    this.key = patchKey
    this.bbox = new Box3(bmin, bmax)
    this.bbox.getSize(this.dimensions)
  }

  writeBlockAtIndex(
    blockIndex: number,
    blockLevel: number,
    blockType: BlockType,
  ) {
    this.groundBlocks.level[blockIndex] = blockLevel
    this.groundBlocks.type[blockIndex] = blockType
  }

  getBlock(localPos: Vector3) {
    let block
    if (
      localPos.x >= 0 &&
      localPos.x < this.dimensions.x &&
      localPos.z >= 0 &&
      localPos.z < this.dimensions.z
    ) {
      const blockIndex = localPos.x * this.dimensions.x + localPos.z
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
        const localPos = useLocalPos ? pos : pos.clone().sub(this.bbox.min)
        const index = localPos.x * this.dimensions.x + localPos.z
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

  *iterBlocks(useLocalCoords?: boolean) {
    const bbox = useLocalCoords
      ? new Box3(new Vector3(0), this.dimensions)
      : this.bbox

    let index = 0
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
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
        index++
        yield blockData
      }
    }
  }

  getPatchCoords() {}

  toStub() {
    const { key } = this
    return {
      key,
    }
  }

  static fromStub(patchStub: PatchStub) {
    const { key, groundBlocks, entitiesChunks } = patchStub
    const patch = new BlocksPatch(key)
    patch.groundBlocks = groundBlocks
    patch.entitiesChunks = entitiesChunks
    // patchStub.entitiesChunks?.forEach((entityChunk: EntityChunk) =>
    //   patch.entitiesChunks.push(entityChunk),
    // )
    return patch
  }

  static getPatchOrigin(input: Box3 | Vector3 | Vector2) {
    const { patchSize } = this
    const inputCopy: Vector3 | Box3 =
      input instanceof Vector2
        ? new Vector3(input.x, 0, input.y)
        : input.clone()
    const point =
      inputCopy instanceof Box3
        ? (inputCopy as Box3).getCenter(new Vector3())
        : (inputCopy as Vector3).clone()
    let minx = point.x - (point.x % patchSize)
    minx -= point.x < 0 && point.x % this.patchSize !== 0 ? patchSize : 0
    let minz = point.z - (point.z % patchSize)
    minz -= point.z < 0 && point.z % this.patchSize !== 0 ? patchSize : 0
    const patchOrigin = new Vector2(minx, minz)
    return patchOrigin
  }
}
