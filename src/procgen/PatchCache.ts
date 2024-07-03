import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { getPatchPoints } from '../common/utils'
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

enum PatchState {
  Empty,
  Filled,
  Done,
  Final,
}

enum BatchProcessStep {
  RegularGen,
  PreTransitionGen,
  TransitionGen,
  PostProcessEntities,
  Done,
}

export class PatchCache {
  // extends Rectangle {
  // eslint-disable-next-line no-use-before-define
  static cache: PatchCache[] = []
  // eslint-disable-next-line no-use-before-define
  static pendingCacheBuild = false
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()
  static ready = false
  static updated = false
  static batch: {
    currentStep: BatchProcessStep
    startTime: number
    totalElapsedTime: number
    count: number
    totalCount: number
    // eslint-disable-next-line no-use-before-define
    regular: PatchCache[]
    // eslint-disable-next-line no-use-before-define
    transition: PatchCache[]
    // eslint-disable-next-line no-use-before-define
    skipped: PatchCache[]
  } = {
    currentStep: BatchProcessStep.RegularGen,
    startTime: 0,
    totalElapsedTime: 0,
    count: 0,
    totalCount: 0,
    regular: [],
    transition: [],
    skipped: [],
  }

  spawnedEntities: EntityData[] = []
  extEntities: EntityData[] = []
  bbox: Box3
  dimensions = new Vector3()
  biomeType: BiomeType // biome value at patch center
  blocks = {
    type: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
    level: new Uint16Array(Math.pow(PatchCache.patchSize, 2)),
  }

  state = PatchState.Empty
  isBiomeTransition = false
  isTransitionPatch = false
  isCloseToRefPatch = false

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
    this.isBiomeTransition = !!getPatchPoints(this.bbox).find(
      point => Biome.instance.getBiomeType(point) !== this.biomeType,
    )
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
      const patch = PatchCache.getPatch(globalPos)
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

  getNearPatches() {
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
    if (this.state < PatchState.Done) {
      const nearPatches = this.getNearPatches()
      // skip patches with incomplete edge patches count or already processed
      if (nearPatches.length === 8) {
        let isFinal = true
        // extEntities
        nearPatches.forEach(patch => {
          isFinal = isFinal && patch.state >= PatchState.Filled
          patch.spawnedEntities
            // .filter(entity => entity.edgesOverlaps)
            .filter(entity => entity.bbox.intersectsBox(this.bbox))
            .forEach(entity => this.extEntities.push(entity))
        })
        this.state = PatchState.Final // isFinal ? PatchState.Final : PatchState.Done
        return true
      }
      // else {
      //   console.log(`incomplete patch edges count: ${nearPatches.length}`)
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

  static updateCache(center: Vector3, radius: number) {
    const { patchSize, batch } = PatchCache
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

    const prevCenter = PatchCache.bbox.getCenter(new Vector3())
    prevCenter.y = 0
    const nextCenter = bbox.getCenter(new Vector3())

    if (
      PatchCache.cache.length === 0 ||
      (batch.currentStep === BatchProcessStep.Done &&
        nextCenter.distanceTo(prevCenter) > patchSize)
    ) {
      PatchCache.bbox = bbox
      const created: PatchCache[] = []
      const existing = []
      for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
        for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
          const patchStart = new Vector2(xmin, zmin)
          // look for existing patch in current cache
          let patch = PatchCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch || patch.state < PatchState.Final) {
            patch = new PatchCache(patchStart)
            created.push(patch)
          } else {
            existing.push(patch)
          }
        }
      }
      const removedCount = PatchCache.cache.length - existing.length
      PatchCache.cache = [...existing, ...created]
      const { batch } = PatchCache

      // sort created patches depending on their type
      for (const patch of created) {
        const nearPatches = patch.getNearPatches()
        const isEdgePatch = nearPatches.length !== 8
        if (!isEdgePatch) {
          patch.isTransitionPatch =
            patch.isBiomeTransition ||
            !!nearPatches.find(edgePatch => edgePatch.isBiomeTransition)
          patch.isTransitionPatch
            ? batch.transition.push(patch)
            : batch.regular.push(patch)
        } else {
          batch.skipped.push(patch)
        }
      }

      // batch.sort((p1, p2) => p1.bbox.getCenter(new Vector3()).distanceTo(center) - p2.bbox.getCenter(new Vector3()).distanceTo(center))
      // PatchCache.processBatch(batch)
      // PatchCache.cacheExtEntities()
      if (created.length > 0) {
        console.log(
          `[PatchCache:update] START patch cache updating: enqueud ${created.length}, kept ${existing.length}, removed ${removedCount} )`,
        )
        batch.count = 0
        batch.totalCount = 0
        batch.startTime = Date.now()
        batch.totalElapsedTime = 0
        batch.currentStep = BatchProcessStep.RegularGen

        const promise = new Promise(resolve => {
          PatchCache.buildNextPatch(resolve)
        })

        return promise
      }
    }
    return null
  }

  static buildNextPatch(onCacheUpdated: any) {
    const { batch } = PatchCache
    switch (batch.currentStep) {
      case BatchProcessStep.RegularGen: {
        const nextPatch = batch.regular.shift()
        if (nextPatch) {
          nextPatch.genPatchBlocks()
          batch.count++
        } else {
          const elapsedTime = Date.now() - batch.startTime
          const avgTime = Math.round(elapsedTime / batch.count)
          console.log(
            `processed ${batch.count} regular patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
          )
          batch.totalElapsedTime += elapsedTime
          batch.totalCount += batch.count
          batch.count = 0
          batch.startTime = Date.now()
          batch.currentStep = BatchProcessStep.PreTransitionGen
        }
        break
      }
      case BatchProcessStep.PreTransitionGen: {
        batch.transition.forEach(patch => {
          patch.isCloseToRefPatch = !!patch
            .getNearPatches()
            .find(p => !p.isTransitionPatch && p.state >= PatchState.Filled)
        })
        // console.log(`switch state from PreTransitionGen to TransitionGen`)
        batch.currentStep = BatchProcessStep.TransitionGen
        break
      }
      case BatchProcessStep.TransitionGen: {
        const nextPatch = batch.transition.shift()
        if (nextPatch) {
          nextPatch.genPatchBlocks()
          batch.count++
        } else {
          const elapsedTime = Date.now() - batch.startTime
          const avgTime = Math.round(elapsedTime / batch.count)
          console.log(
            `processed ${batch.count} transition patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
          )
          batch.totalElapsedTime += elapsedTime
          batch.totalCount += batch.count
          batch.count = 0
          batch.startTime = Date.now()
          batch.currentStep = BatchProcessStep.PostProcessEntities
        }
        break
      }
      case BatchProcessStep.PostProcessEntities: {
        const count = PatchCache.cacheExtEntities()
        const elapsedTime = Date.now() - batch.startTime
        console.log(`postprocessed ${count} patches in ${elapsedTime}ms`)
        batch.totalElapsedTime += elapsedTime
        const avgTime = Math.round(batch.totalElapsedTime / batch.totalCount)
        console.log(
          `[PatchCache:buildNextPatch] DONE processed ${batch.totalCount} patches in ${batch.totalElapsedTime} ms (avg ${avgTime} ms per patch) `,
        )
        onCacheUpdated()
        batch.currentStep = BatchProcessStep.Done
        break
      }
    }
    if (batch.currentStep !== BatchProcessStep.Done)
      setTimeout(() => PatchCache.buildNextPatch(onCacheUpdated), 0)
  }

  static cacheExtEntities() {
    const patchCount = PatchCache.cache
      .map(patch => patch.cacheExtEntities())
      .filter(val => val).length
    return patchCount
  }

  buildRefPoints() {
    const refPatches: PatchCache[] = []
    const refPoints: any[] = []
    const nearPatches = this.getNearPatches()
    const transitionPatches = nearPatches.filter(
      patch => patch.isTransitionPatch,
    )
    transitionPatches.forEach(patch => {
      if (patch.isCloseToRefPatch) {
        refPatches.push(patch)
      } else {
        patch
          .getNearPatches()
          .filter(
            patch2 =>
              patch2.isTransitionPatch &&
              patch2.isCloseToRefPatch &&
              !refPatches.find(refPatch => refPatch.bbox.equals(patch2.bbox)),
          )
          .forEach(patch2 => refPatches.push(patch2))
      }
    })
    refPatches.forEach(patch => {
      const nearPatches = patch.getNearPatches()
      getPatchPoints(patch.bbox)
        .filter(point => !refPoints.find(item => item.pos.equals(point)))
        .forEach(pos => {
          const matching = nearPatches.filter(
            patch =>
              !patch.isTransitionPatch &&
              patch.bbox.min.x <= pos.x &&
              patch.bbox.min.z <= pos.z &&
              patch.bbox.max.x >= pos.x &&
              patch.bbox.max.z >= pos.z,
          )
          const biome = matching[0]?.biomeType
          if (matching.length > 0) refPoints.push({ pos, biome })
        })
    })
    refPoints.forEach(point => {
      point.pos.y = Heightmap.instance.getGroundLevel(point.pos)
    })
    // if (refPoints.length > 8)
    //   console.log(refPoints)
    return refPoints
  }

  getInterpolatedBlock(pos: Vector3, refPoints: any[]) {
    const rawVal = Heightmap.instance.getRawVal(pos)
    const p = 4
    let totalWeight = 0
    const biomesWeights: Record<BiomeType, number> = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
    }

    for (const point of refPoints) {
      point.pos.y = 0
      pos.y = point.pos.y
      const dist = pos.distanceTo(point.pos)
      if (dist < 1) {
        totalWeight = 1
        Object.keys(biomesWeights).forEach(
          k => (biomesWeights[k as BiomeType] = k === point.biome ? 1 : 0),
        )
        break
      } else {
        const w = Math.pow(1 / dist, p)
        totalWeight += w
        biomesWeights[point.biome as BiomeType] += w
      }
    }
    let h = 0
    const blockPos = pos.clone()
    Object.entries(biomesWeights).forEach(([k, v]) => {
      const w = v / totalWeight
      h +=
        w * Heightmap.instance.getGroundLevel(blockPos, rawVal, k as BiomeType)
    })
    return Math.round(h)
  }

  genPatchBlocks() {
    const startTime = Date.now()
    const { min, max } = this.bbox
    const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
    const prng = alea(patchId)
    const refPoints = this.isTransitionPatch ? this.buildRefPoints() : []
    const blocksIter = this.blockIterator()
    min.y = 255
    max.y = 0
    let blockIndex = 0

    for (const blockData of blocksIter) {
      blockData.pos.y = 0
      // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
      const biomeType = this.isBiomeTransition
        ? Biome.instance.getBiomeType(blockData.pos)
        : this.biomeType
      const rawVal = Heightmap.instance.getRawVal(blockData.pos)
      const blockTypes = Biome.instance.getBlockType(rawVal, biomeType)
      blockData.pos.y = this.isTransitionPatch
        ? this.getInterpolatedBlock(blockData.pos, refPoints)
        : Heightmap.instance.getGroundLevel(blockData.pos, rawVal, biomeType)
      blockData.type = blockTypes.grounds[0] as BlockType

      let allowSpawn
      if (blockTypes.entities?.[0]) {
        const ent = this.spawnedEntities.find(entity => {
          const entityPos = entity.bbox.getCenter(new Vector3())
          return blockData.pos.distanceTo(entityPos) < 10
        })
        allowSpawn = !ent
      }

      const entity =
        allowSpawn && Vegetation.instance.spawnEntity(blockData.pos, prng)
      if (entity) {
        entity.type = blockTypes.entities[0] as TreeType
        const entityPos = entity.bbox.getCenter(new Vector3())
        const entityHeight = 10
        entity.bbox.min.y = this.isTransitionPatch
          ? this.getInterpolatedBlock(entityPos, refPoints)
          : Heightmap.instance.getGroundLevel(entityPos)
        // entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
        entity.bbox.max.y = entity.bbox.min.y // + entityHeight
        // check if it has an overlap with edge patch(es)
        // e.g. check if current patch don't fully contain entity
        if (!this.bbox.containsBox(entity.bbox)) {
          // find edge points that don't belongs to current patch
          const edgePoints = getPatchPoints(entity.bbox)
          entity.edgesOverlaps = edgePoints.filter(
            p => !this.bbox.containsPoint(p),
          )
        }
        entity.bbox.max.y += entityHeight
        this.spawnedEntities.push(entity)
      }
      // const levelMax = blockData.cache.level + blockData.cache.overground.length
      min.y = Math.min(min.y, blockData.pos.y)
      max.y = Math.max(max.y, blockData.pos.y)
      this.writeBlockAtIndex(blockIndex, blockData.pos.y, blockData.type)
      blockIndex++
    }
    this?.bbox.getSize(this.dimensions)
    // perform blocks buffer generation pass
    PatchCache.bbox.union(this.bbox)
    const elapsedTime = Date.now() - startTime
    // const perPatchAvg = Math.round(elapsedTime / PatchCache.queue.length)
    // console.log(`[PatchCache:buildPatch] time ${elapsedTime} ms`)
    // console.log(`[PatchCache:buildPatch]`)
    this.state = PatchState.Filled
    return elapsedTime
  }
}
