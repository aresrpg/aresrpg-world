import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'
import { getBBoxXZCornerPoints, roundToDec } from '../common/utils'

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
  // eslint-disable-next-line no-use-before-define
  static queue: PatchCache[] = []
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()
  static ready = false
  static updated = false
  spawnedEntities: EntityData[] = []
  extEntities: EntityData[] = []
  bbox: Box3
  dimensions = new Vector3()
  biomeType: BiomeType // biome value at patch center
  blocks = {
    type: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
    level: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
  }

  done = false
  isBiomeTransition = false

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
    let block
    globalPos.y = PatchCache.bbox.getCenter(new Vector3()).y
    if (PatchCache.bbox.containsPoint(globalPos)) {
      // find patch containing point in cache
      const patch = this.getPatch(globalPos)
      if (patch) {
        const localPos = globalPos.clone().sub(patch.bbox.min)
        block = patch.getBlock(localPos) as BlockData
        const pos = globalPos.clone()
        pos.y = block.pos.y
        const buffer: BlockType[] = []
        patch
          .getEntities()
          .filter(entity => entity.bbox.containsPoint(pos))
          .forEach(entity =>
            Vegetation.singleton.fillBuffer(pos, entity, buffer),
          )
        block.buffer = buffer
      }
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

  getEdgePatches() {
    const dim = this.dimensions
    const patchCenter = this.bbox.getCenter(new Vector3())
    const minX = patchCenter.clone().add(new Vector3(-dim.x, 0, 0))
    const maxX = patchCenter.clone().add(new Vector3(dim.x, 0, 0))
    const minZ = patchCenter.clone().add(new Vector3(0, 0, -dim.z))
    const maxZ = patchCenter.clone().add(new Vector3(0, 0, dim.z))
    const minXminZ = patchCenter.clone().add(new Vector3(-dim.x, 0, -dim.z))
    const minXmaxZ = patchCenter.clone().add(new Vector3(-dim.x, 0, dim.z))
    const maxXminZ = patchCenter.clone().add(new Vector3(dim.x, 0, -dim.z))
    const maxXmaxZ = patchCenter.clone().add(new Vector3(dim.x, 0, dim.z))
    const neighboursCenters = [
      minX,
      maxX,
      minZ,
      maxZ,
      minXminZ,
      minXmaxZ,
      maxXminZ,
      maxXmaxZ,
    ]
    const patchNeighbours: PatchCache[] = neighboursCenters
      .map(patchCenter => PatchCache.getPatch(patchCenter))
      .filter(patch => patch) as PatchCache[]
    return patchNeighbours
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

  writeBlockAtIndex(
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
    this.writeBlockAtIndex(blockIndex, blockLevel, blockType)
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
   * Gathers all entities impacting this patch
   * @param excludeNearPatches
   * @returns
   */
  getEntities() {
    this.cacheExtEntities()
    return [...this.spawnedEntities, ...this.extEntities]
  }

  cacheExtEntities() {
    if (!this.done) {
      const edgePatches = this.getEdgePatches()
      // skip patches with incomplete edge patches count or already processed
      if (edgePatches.length === 8) {
        this.done = true
        // extEntities
        edgePatches.forEach(patch => {
          patch.spawnedEntities
            // .filter(entity => entity.edgesOverlaps)
            .filter(entity => entity.bbox.intersectsBox(this.bbox))
            .forEach(entity => this.extEntities.push(entity))
        })
        return true
      }
      // else {
      //   console.log(`incomplete patch edges count: ${edgePatches.length}`)
      // }
    }
    return false
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
      PatchCache.bbox = bbox
      const existing = []
      for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
        for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
          const patchStart = new Vector2(xmin, zmin)
          // look for existing patch in current cache
          let patch = PatchCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch || !patch.done) {
            patch = new PatchCache(patchStart)
            PatchCache.queue.push(patch)
          } else {
            existing.push(patch)
          }
        }
      }
      const removedCount = this.cache.length - existing.length
      this.cache = [...existing, ...this.queue]
      console.log(
        `[PatchCache:update] enqueud: ${this.queue.length}, kept: ${existing.length}, removed: ${removedCount} )`,
      )
      return true
    }
    return false
  }

  static cacheExtEntities() {
    let elapsedTime = Date.now()
    const patchCount = PatchCache.cache
      .map(patch => patch.cacheExtEntities())
      .filter(val => val).length
    elapsedTime -= Date.now()
    elapsedTime = Math.abs(elapsedTime)
    // const perPatchMs = Math.round(elapsedTime / patchCount)
    console.log(
      `[PatchCache:cacheExtEntities] ${patchCount} patches processed in ${elapsedTime}ms`,
    )
    return elapsedTime
  }

  static buildNextBatch(batchCount = PatchCache.queue.length, maxDuration = 0) {
    let elapsed = 0
    // maxCount = MathUtils.clamp(maxCount, Math.round(PatchCache.queue.length / 100), PatchCache.queue.length)
    batchCount = Math.max(batchCount, Math.round(PatchCache.queue.length / 100))
    let count = 0
    while (
      PatchCache.queue.length > 0 &&
      count <= batchCount &&
      // eslint-disable-next-line no-unmodified-loop-condition
      (maxDuration === 0 || elapsed < maxDuration)
    ) {
      const patch = PatchCache.queue.shift() as PatchCache
      if (!patch.isBiomeTransition) {
        const edgePatches = patch.getEdgePatches()
        if (edgePatches.length === 8) {
          patch.isBiomeTransition = !!edgePatches
            .find(edgePatch => edgePatch.biomeType !== patch.biomeType)
          if (!patch.isBiomeTransition) {
            elapsed += patch.genPatchBlocks()
            // PatchCache.cache.push(patch)
            console.log(`build regular patch`)
          } else {
            console.log(`postpone biome transitioning patch`)
            // postpone biome transitioning patches
            PatchCache.queue.push(patch)
          }
        } else {
          console.log(`patch edges count ${edgePatches.length}`)
        }
      } else {
        elapsed += patch.genPatchBlocks()
        // PatchCache.cache.push(patch)
      }

      count++
    }
    if (count > 0) {
      PatchCache.updated = true
      const avgMs = Math.round(elapsed / count)
      console.log(`[PatchCache:buildNextBatch] remaining ${PatchCache.queue.length} (done ${count}, avg per patch ${avgMs}ms)`)
      return true
    }
    return false
  }

  buildPatchEntity(entity: EntityData) {

    // discard entities spawning too close to another
    // const discarded = entity && patch.spawnedEntities.find(entity2 =>
    //   entity2.bbox.intersectsBox(entity.bbox)
    //   && bbox.getCenter(new Vector3())
    //     .distanceTo(entity.bbox.getCenter(new Vector3())) < 8,
    // )

    const entityPos = entity.bbox.getCenter(new Vector3())
    const entityHeight = 10
    entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
    entity.bbox.max.y = entity.bbox.min.y // + entityHeight
    // check if it has an overlap with edge patch(es)
    if (!this.bbox.containsBox(entity.bbox)) {
      // find edge points that don't belongs to current patch
      const pMin = entity.bbox.min
      const p1 = entity.bbox.min.clone()
      const p2 = entity.bbox.min.clone()
      const pMax = entity.bbox.max
      p1.x = pMax.x
      p2.z = pMax.z
      const edgePoints = [pMin, p1, p2, pMax]
      entity.edgesOverlaps = edgePoints.filter(
        p => !this.bbox.containsPoint(p),
      )
      // if (entity.bbox.min.z < patch.bbox.min.z) entity.edgesOverlaps.push(PatchEdge.BACK)
      // if (entity.bbox.max.z > patch.bbox.max.z) entity.edgesOverlaps.push(PatchEdge.FRONT)
      // if (entity.bbox.min.x < patch.bbox.min.x) entity.edgesOverlaps.push(PatchEdge.LEFT)
      // if (entity.bbox.max.x > patch.bbox.max.x) entity.edgesOverlaps.push(PatchEdge.RIGHT)
    }
    entity.bbox.max.y += entityHeight
    // const entity = new Circle({ x: entityPos.x, y: entityPos.z, r: 5, data: entityPos })
    this.spawnedEntities.push(entity)
    // BlocksPatch.quadtree.insert(entity)
    // Vegetation.instance.markTreeBlocks(blockData.pos, treeType)
  }

  getPointData(refPoint) {
    refPoint.y = 0
    const nearPatches = [...PatchCache.cache]
      .filter(patch => patch.bbox.min.x <= refPoint.x &&
        patch.bbox.min.z <= refPoint.z &&
        patch.bbox.max.x >= refPoint.x &&
        patch.bbox.max.z >= refPoint.z)
    if (nearPatches.length === 4) {
      const refPatch = nearPatches.find(patch => !patch.isBiomeTransition)
      let biome: any = {}
      if (refPatch) {
        biome[refPatch.biomeType] = 1
      } else {
        nearPatches.forEach(np => {
          biome[np.biomeType] = biome[np.biomeType] ? biome[np.biomeType] + 1 / 4 : 1 / 4
        })
        console.log(biome)
      }
      Object.entries(biome)
      const data = { pos: refPoint, biome }
      return (data)
    } else {
      // console.log(`skip edge patch`)
      return null
    }
    // if (refPatch) pt.
  }

  getPatchCorners() {
    const patchCorners: Vector3[] = getBBoxXZCornerPoints(this.bbox)
      .map(refPoint => this.getPointData(refPoint))
      .filter(val => val)
    return patchCorners
  }
  /**
   * @param blockPos 
   * @param patchCorners 
   * @returns 
   */
  getBlockInterpolationWeights(blockPos: Vector3, patchCorners) {
    const pow = 6
    const ptsWeightSum = patchCorners.reduce((sum, elt) => sum + Math.pow(1 / blockPos.distanceTo(elt.pos), pow), 0)
    const weightedData = patchCorners.map(elt => {
      const invDist = 1 / blockPos.distanceTo(elt.pos)
      const weight = Math.pow(invDist, pow) / ptsWeightSum// roundToDec(dist / ptsWeightSum, 2)
      const data = {
        pos: elt.point,
        biome: elt.biome,
        level: 0
      }
      return ({
        data,
        weight
      })
    })
    return weightedData
  }

  getBiomeInterpolation(blockPos: Vector3, patchCorners) {
    let ptWeightSum = 0
    const biomeInterpol = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
    }
    patchCorners.forEach(item => {
      const ptWeight = blockPos.distanceTo(item.pos)
      Object.entries(item.biome).forEach(([bType, bWeight]) => biomeInterpol[bType] += ptWeight * bWeight / 4)
      ptWeightSum += ptWeight
    })
    Object.keys(biomeInterpol).forEach((bType) => biomeInterpol[bType] = roundToDec(biomeInterpol[bType] / ptWeightSum, 2))
    return biomeInterpol
  }

  getInterpolatedBiome(weightedData) {
    const biomeInterpol = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
    }

    weightedData.forEach(item => {
      const { weight, data } = item
      Object.entries(data.biome)
        .forEach(([bType, bWeight]) => biomeInterpol[bType] += weight * bWeight)
    })
    Object.keys(biomeInterpol)
      .forEach((bType) => biomeInterpol[bType] = roundToDec(biomeInterpol[bType], 2))
    return biomeInterpol
  }

  getInterpolatedBlock(blockPos: Vector3, patchCorners) {

  }

  genPatchBlocks() {
    const startTime = Date.now()
    const { bbox } = this
    const patchId =
      this.bbox.min.x +
      ',' +
      this.bbox.min.z +
      '-' +
      this.bbox.max.x +
      ',' +
      this.bbox.max.z
    const prng = alea(patchId)

    let patchCorners = this.isBiomeTransition ? this.getPatchCorners() : []

    const blocksIter = this.blockIterator()
    bbox.min.y = 255
    bbox.max.y = 0
    let blockIndex = 0
    const patchBiome = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
    }
    patchBiome[this.biomeType] = 1
    for (const blockData of blocksIter) {
      blockData.pos.y = 0
      // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
      const biomeType = this.isBiomeTransition ? Biome.instance.getBiomeType(blockData.pos) : this.biomeType
      const rawVal = Heightmap.instance.getRawVal(blockData.pos)
      const blockTypes = Biome.instance.getBlockType(rawVal, biomeType)
      blockData.pos.y = Heightmap.instance.getGroundLevel(
        blockData.pos,
        rawVal,
        biomeType,
      )
      blockData.type = blockTypes.grounds[0] as BlockType

      if (this.isBiomeTransition) {
        const weightedData = this.getBlockInterpolationWeights(blockData.pos, patchCorners)
        // console.log(interpBiome)
        const patchCorner = patchCorners?.find(item => {
          item.pos.y = blockData.pos.y
          return item.pos.distanceTo(blockData.pos) < 2
        })
        let biomeTypes = patchCorner?.biome || this.getInterpolatedBiome(weightedData)// this.getBiomeInterpolation(blockData.pos, patchCorners)
        // mark patch corners in transition patches
        if (patchCorner) {
          const isRegularCorner = Object.keys(patchCorner?.biome).length === 1
          blockData.type = isRegularCorner ? BlockType.MUD : BlockType.SAND
        }
        // add all biome contributions
        blockData.pos.y = Object.entries(biomeTypes)
          .reduce((sum, [type, weight]) =>
            sum + weight * Heightmap.instance.getGroundLevel(
              blockData.pos,
              rawVal,
              type as BiomeType,
            ), 0)
      }

      // const blockItem = new Circle({ x: blockData.pos.x, y: blockData.pos.z, r: 1 })
      // const items = BlocksPatch.quadtree.retrieve(blockItem)
      // const existingTree = items.find(item => new Vector2((item as Circle).x, (item as Circle).y)
      //   .distanceTo(blockItem) < (item as Circle).r)
      let allowSpawn
      if (!this.isBiomeTransition && blockTypes.entities?.[0]) {
        const ent = this.spawnedEntities.find(entity => {
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
        entity.type = blockTypes.entities[0] as TreeType
        this.buildPatchEntity(entity)
      }
      // const levelMax = blockData.cache.level + blockData.cache.overground.length
      bbox.min.y = Math.min(bbox.min.y, blockData.pos.y)
      bbox.max.y = Math.max(bbox.max.y, blockData.pos.y)
      this.writeBlockAtIndex(blockIndex, blockData.pos.y, blockData.type)
      blockIndex++
    }
    this?.bbox.getSize(this.dimensions)
    // perform blocks buffer generation pass
    PatchCache.bbox.union(bbox)
    const elapsedTime = Date.now() - startTime
    // const perPatchAvg = Math.round(elapsedTime / PatchCache.queue.length)
    // console.log(`[PatchCache:buildPatch] time ${elapsedTime} ms`)
    // console.log(`[PatchCache:buildPatch]`)
    return elapsedTime
  }
}
