import { Box3, Vector2, Vector3 } from 'three'

import { BlockType } from './Biome'
import { PatchBaseCache } from './PatchBaseCache'
import { PatchCache } from './PatchCache'

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

export type BlockIteratorRes = IteratorResult<BlockData, void>

/**
 * Blocks cache
 */
export class PatchBlocksCache extends PatchCache {
  // eslint-disable-next-line no-use-before-define
  static instances: PatchBlocksCache[] = []
  static override bbox = new Box3()
  static cacheSize = PatchCache.patchSize * 5
  static patchCacheProvider: any
  // groundBlocks: Uint16Array = new Uint16Array(Math.pow(PatchCache.patchSize, 2))
  groundBlocks = {
    type: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
    level: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
  }

  entitiesChunks: EntityChunk[] = []
  initialPatchRef?: PatchBaseCache

  constructor(input: Vector2 | PatchBlocksCache) {
    super(
      input instanceof Vector2
        ? input
        : new Vector2(input.bbox.min.x, input.bbox.min.z),
    )
    if ((input as any).groundBlocks) {
      const { bbox, dimensions, groundBlocks } = input as any
      const bmin = new Vector3(...(Object.values(bbox.min) as any))
      const bmax = new Vector3(...(Object.values(bbox.max) as any))
      this.bbox = new Box3(bmin, bmax)
      this.dimensions = new Vector3(...(Object.values(dimensions) as any))
      this.groundBlocks = groundBlocks
    }
    ;(input as any).entitiesChunks?.forEach((entityChunk: EntityChunk) =>
      this.entitiesChunks.push(entityChunk),
    )
    PatchBlocksCache.bbox.union(this.bbox)
  }

  static override getPatch(inputPoint: Vector3 | Vector2) {
    return super.getPatch(inputPoint, this.instances) as PatchBlocksCache
    // const patchRes = this.patchCache.find(patch =>
    //   patch.bbox.min.x === patchBbox.min.x
    //   && patch.bbox.min.z === patchBbox.min.z
    //   && patch.bbox.max.x === patchBbox.max.x
    //   && patch.bbox.max.z === patchBbox.max.z
    // )
    // return patchRes
  }

  static override getPatches(inputBbox: Box3) {
    return super.getPatches(inputBbox, this.instances) as PatchBlocksCache[]
  }

  override getNearPatches(): PatchBlocksCache[] {
    return super.getNearPatches(
      PatchBlocksCache.instances,
    ) as PatchBlocksCache[]
  }

  static getGroundBlock(globalPos: Vector3) {
    let baseBlock
    globalPos.y = PatchBlocksCache.bbox.getCenter(new Vector3()).y
    if (PatchBlocksCache.bbox.containsPoint(globalPos)) {
      const patch = PatchBlocksCache.getPatch(globalPos)
      if (patch) {
        const localPos = globalPos.clone().sub(patch.bbox.min)
        baseBlock = patch.getBlock(localPos) as BlockData
      }
    }
    return baseBlock
  }

  static getBlock(globalPos: Vector3) {
    const block = PatchBlocksCache.getGroundBlock(globalPos)
    if (block) {
      block.buffer = PatchBaseCache.genOvergroundBlocks(block)
    }
    return block
  }

  static setBlock(globalPos: Vector3, block: BlockData) {
    // find patch containing point in cache
    const patch = this.getPatch(globalPos)
    if (patch) {
      const localPos = globalPos.clone().sub(patch.bbox.min)
      patch.setBlock(localPos, block.type)
    } else {
      console.log(globalPos)
    }
    return block
  }

  static cleanDeprecated(keep: PatchCache[]) {
    const missingPatches: PatchCache[] = []
    const kept = keep
      .map(intPatch => {
        const patchStart = new Vector3(...Object.values(intPatch.bbox.min))
        const extPatch = PatchBlocksCache.getPatch(patchStart)
        if (!extPatch) {
          missingPatches.push(intPatch)
        }
        return extPatch
      })
      .filter(extPatch => {
        return !!extPatch
      })
    this.instances = kept
    if (missingPatches.length > 0) {
      console.warn(
        `External cache sync issue: ${missingPatches.length} existing patch not found`,
        missingPatches,
      )
    }
  }

  /**
   * Query patch cache provider to fill local blocks data
   */
  static async fill(batch: PatchBlocksCache[]) {
    for (const patch of batch) {
      const res = await PatchBlocksCache.patchCacheProvider(patch.bbox)
      patch.groundBlocks = res.data
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

  getBlock(localPos: Vector3) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const pos = localPos.clone()
    pos.y = this.groundBlocks.level[blockIndex] || 0
    const type = this.groundBlocks.type[blockIndex]
    const block = {
      pos,
      type,
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

  *getBlocks(bbox: Box3) {
    const bmin = new Vector3(
      Math.max(bbox.min.x, this.bbox.min.x),
      0,
      Math.max(bbox.min.z, this.bbox.min.z),
    )
    const bmax = new Vector3(
      Math.min(bbox.max.x, this.bbox.max.x),
      0,
      Math.min(bbox.max.z, this.bbox.max.z),
    )
    for (let { x } = bmin; x < bmax.x; x++) {
      for (let { z } = bmin; z < bmax.z; z++) {
        const pos = new Vector3(x, 0, z)
        const localPos = pos.clone().sub(this.bbox.min)
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

  *iterator(useLocalCoords?: boolean) {
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
}
