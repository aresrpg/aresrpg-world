import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { Heightmap } from '../index'
import { TreeType } from '../tools/TreeGenerator'

import { Biome, BiomeType, BlockType } from './Biome'
import { EntityData, Vegetation } from './Vegetation'

export type BlockData = {
  pos: Vector3
  type: BlockType
  localPos?: Vector3
  buffer?: BlockType[]
}

export type BlockIteratorRes = IteratorResult<BlockData, void>

export class PatchCache {
  // extends Rectangle {
  // eslint-disable-next-line no-use-before-define
  static cache: PatchCache[] = []
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()
  static ready = false
  spawnedEntities: EntityData[] = []
  bbox: Box3
  dimensions = new Vector3()
  biomeType: BiomeType // biome value at patch center
  blocks = {
    type: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
    level: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
  }

  constructor(patchOrigin: Vector2) {
    const { patchSize } = PatchCache
    const bmin = new Vector3(patchOrigin.x, 0, patchOrigin.y)
    const bmax = new Vector3(
      patchOrigin.x + patchSize,
      255,
      patchOrigin.y + patchSize,
    )
    this.bbox = new Box3(bmin, bmax)
    this.bbox.getSize(this.dimensions)
    // init patch biome
    const patchCenter = this.bbox.getCenter(new Vector3())
    this.biomeType = Biome.instance.getBiomeType(patchCenter)
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

  static getPatches(inputBbox: Box3) {
    const bbox = inputBbox.clone()
    bbox.min.y = 0
    bbox.max.y = 512
    const res = PatchCache.cache.filter(patch => patch.bbox.intersectsBox(bbox))
    return res
  }

  static getPatch(inputPoint: Vector2 | Vector3) {
    const point = new Vector3(
      inputPoint.x,
      0,
      inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    )

    const res = this.cache.find(
      patch =>
        point.x >= patch.bbox.min.x &&
        point.z >= patch.bbox.min.z &&
        point.x < patch.bbox.max.x &&
        point.z < patch.bbox.max.z,
    )
    return res
  }

  static getBlock(globalPos: Vector3) {
    // find patch containing point in cache
    const patch = this.getPatch(globalPos)
    let block
    if (patch) {
      const localPos = globalPos.clone().sub(patch.bbox.min)
      block = patch.getBlock(localPos) as BlockData
      const pos = globalPos.clone()
      pos.y = block.pos.y
      const buffer: BlockType[] = []
      patch
        .getEntities()
        .filter(entity => entity.bbox.containsPoint(pos))
        .forEach(entity => Vegetation.singleton.fillBuffer(pos, entity, buffer))
      block.buffer = buffer
    }
    // else {
    //     console.log(`block not found`)
    // }
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

  getBlock(localPos: Vector3) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const pos = localPos.clone()
    pos.y = this.blocks.level[blockIndex] || 0
    const type = this.blocks.type[blockIndex]
    const block = {
      pos,
      type,
    }
    return block
  }

  setBlockAtIndex(
    blockIndex: number,
    blockLevel: number,
    blockType: BlockType,
  ) {
    this.blocks.level[blockIndex] = blockLevel
    this.blocks.type[blockIndex] = blockType
  }

  setBlock(localPos: Vector3, blockType: BlockType) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const blockLevel = localPos.y
    this.setBlockAtIndex(blockIndex, blockLevel, blockType)
    // const levelMax = blockLevel + blockData.over.length
    // bbox.min.y = Math.min(bbox.min.y, levelMax)
    // bbox.max.y = Math.max(bbox.max.y, levelMax)
  }

  *blockIterator(useLocalCoords?: boolean) {
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
        const type = this.blocks.type[index] || BlockType.NONE
        const level = this.blocks.level[index] || 0
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
        const type = this.blocks.type[index] || BlockType.NONE
        const level = this.blocks.level[index] || 0
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

  /**
   * Gathers all entities affecting this patch
   * @param excludeNearPatches
   * @returns
   */
  getEntities(excludeNearPatches = false) {
    let entities = this.spawnedEntities
    if (!excludeNearPatches) {
      const bbox = this.bbox.clone().expandByScalar(1)
      const nearPatches = PatchCache.getPatches(bbox)
      const allEntities = nearPatches.reduce<EntityData[]>(
        (agg, patch) => [...agg, ...patch.spawnedEntities],
        [],
      )
      entities = allEntities.filter(entity =>
        entity.bbox.intersectsBox(this.bbox),
      )
    }
    return entities
  }

  *overBlocksIter() {
    const entities = this.getEntities()
    for (const entity of entities) {
      const blocksIter = this.getBlocks(entity.bbox)
      // let item: BlockIteratorRes = blocksIter.next()
      for (const block of blocksIter) {
        const overBlocksBuffer = Vegetation.singleton.fillBuffer(
          block.pos,
          entity,
          [],
        )
        this.bbox.max.y = Math.max(
          this.bbox.max.y,
          block.pos.y + overBlocksBuffer.length,
        )
        block.buffer = overBlocksBuffer
        yield block
      }
    }
  }

  static updateCache(center: Vector3, radius: number, forceUpdate = false) {
    const { patchSize } = this
    const bbox = new Box3().setFromCenterAndSize(
      center,
      new Vector3(radius, 0, radius),
    )
    bbox.min.x = bbox.min.x - (bbox.min.x % patchSize)
    bbox.min.z = bbox.min.z - (bbox.min.z % patchSize)
    bbox.max.x = bbox.max.x - (bbox.max.x % patchSize) + patchSize
    bbox.max.z = bbox.max.z - (bbox.max.z % patchSize) + patchSize
    bbox.min.x -= bbox.min.x < 0 ? patchSize : 0
    bbox.min.z -= bbox.min.z < 0 ? patchSize : 0
    bbox.min.y = 0
    bbox.max.y = 0

    const prevCenter = this.bbox.getCenter(new Vector3())
    prevCenter.y = 0
    const nextCenter = bbox.getCenter(new Vector3())
    if (forceUpdate || nextCenter.distanceTo(prevCenter) > patchSize) {
      const startTime = Date.now()
      PatchCache.bbox = bbox
      const existing = []
      const created = []
      for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
        for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
          const patchStart = new Vector2(xmin, zmin)
          // look for existing patch in current cache
          let patch = PatchCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch) {
            patch = new PatchCache(patchStart)
            created.push(patch)
          } else {
            existing.push(patch)
          }
        }
      }
      // build new patches
      created.forEach(patch => {
        PatchCache.buildPatch(patch)
        patch?.bbox.getSize(patch.dimensions)
      })
      const elapsedTime = Date.now() - startTime
      const perPatchAvg = Math.round(elapsedTime / created.length)
      const removedCount = this.cache.length - existing.length
      this.cache = [...existing, ...created]
      console.log(
        `[PatchCache] total time ${elapsedTime} ms (${perPatchAvg} ms per patch) => created: ${created.length}, updated: ${existing.length}, removed: ${removedCount} )`,
      )
      return true
    }
    return false
  }

  static buildPatch(patch: PatchCache) {
    const { bbox } = patch
    const patchId =
      patch.bbox.min.x +
      ',' +
      patch.bbox.min.z +
      '-' +
      patch.bbox.max.x +
      ',' +
      patch.bbox.max.z
    const prng = alea(patchId)

    // fill tree buffer
    // this.vegetation.treeGen(bbox)
    // sampling volume
    const blocksIter = patch.blockIterator()
    bbox.min.y = 255
    bbox.max.y = 0
    let blockIndex = 0
    for (const blockData of blocksIter) {
      const rawVal = Heightmap.instance.getRawVal(blockData.pos)
      const blockTypes = Biome.instance.getBlockType(rawVal, patch.biomeType)
      blockData.pos.y = Heightmap.instance.getGroundLevel(
        blockData.pos,
        rawVal,
        patch.biomeType,
      )
      blockData.type = blockTypes.grounds[0] as BlockType // || blockData.cache.type
      // const blockItem = new Circle({ x: blockData.pos.x, y: blockData.pos.z, r: 1 })
      // const items = BlocksPatch.quadtree.retrieve(blockItem)
      // const existingTree = items.find(item => new Vector2((item as Circle).x, (item as Circle).y)
      //   .distanceTo(blockItem) < (item as Circle).r)
      let allowSpawn
      if (blockTypes.entities?.[0]) {
        const ent = patch.spawnedEntities.find(entity => {
          const entityPos = entity.bbox.getCenter(new Vector3())
          return blockData.pos.distanceTo(entityPos) < 10
        })
        allowSpawn = !ent
      }
      // if(trees.find(tree=>tree.containsPoint(blockData.pos))){
      // if block belongs to existing tree
      // if (existingTree) {
      //   treeType ? existingTree.data.blocks.push(blockData) : BlocksPatch.quadtree.remove(existingTree)
      // }
      // // else check if a tree is spawning
      // else
      const entity =
        allowSpawn && Vegetation.instance.spawnEntity(blockData.pos, prng)
      if (entity) {
        // discard entities spawning too close to another
        // const discarded = entity && patch.spawnedEntities.find(entity2 =>
        //   entity2.bbox.intersectsBox(entity.bbox)
        //   && bbox.getCenter(new Vector3())
        //     .distanceTo(entity.bbox.getCenter(new Vector3())) < 8,
        // )
        entity.type = blockTypes.entities[0] as TreeType

        const entityPos = entity.bbox.getCenter(new Vector3())
        const entityHeight = 10
        entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
        entity.bbox.max.y = entity.bbox.min.y // + entityHeight
        // check if it has an overlap with edge patch(es)
        if (!patch.bbox.containsBox(entity.bbox)) {
          // find edge points that don't belongs to current patch
          const pMin = entity.bbox.min
          const p1 = entity.bbox.min.clone()
          const p2 = entity.bbox.min.clone()
          const pMax = entity.bbox.max
          p1.x = pMax.x
          p2.z = pMax.z
          const edgePoints = [pMin, p1, p2, pMax]
          entity.edgesOverlaps = edgePoints.filter(
            p => !patch.bbox.containsPoint(p),
          )
          // if (entity.bbox.min.z < patch.bbox.min.z) entity.edgesOverlaps.push(PatchEdge.BACK)
          // if (entity.bbox.max.z > patch.bbox.max.z) entity.edgesOverlaps.push(PatchEdge.FRONT)
          // if (entity.bbox.min.x < patch.bbox.min.x) entity.edgesOverlaps.push(PatchEdge.LEFT)
          // if (entity.bbox.max.x > patch.bbox.max.x) entity.edgesOverlaps.push(PatchEdge.RIGHT)
        }
        entity.bbox.max.y += entityHeight
        // const entity = new Circle({ x: entityPos.x, y: entityPos.z, r: 5, data: entityPos })
        patch.spawnedEntities.push(entity)
        // BlocksPatch.quadtree.insert(entity)
        // Vegetation.instance.markTreeBlocks(blockData.pos, treeType)
      }
      // const levelMax = blockData.cache.level + blockData.cache.overground.length
      bbox.min.y = Math.min(bbox.min.y, blockData.pos.y)
      bbox.max.y = Math.max(bbox.max.y, blockData.pos.y)
      patch.setBlockAtIndex(blockIndex, blockData.pos.y, blockData.type)
      blockIndex++
    }
    // perform blocks buffer generation pass
    PatchCache.bbox.union(bbox)
  }
}
