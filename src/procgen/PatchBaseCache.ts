import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { getPatchPoints } from '../common/utils'
import { Heightmap, PatchCache } from '../index'
import { TreeType } from '../tools/TreeGenerator'

import { Biome, BiomeType, BlockType } from './Biome'
import { EntityChunk, PatchBlocksCache } from './PatchBlocksCache'
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

const cacheSyncProvider = (batch: any) => {
  batch.kept?.length > 0 && PatchBlocksCache.cleanDeprecated(batch.kept)
  batch.created?.forEach((blocksPatch: PatchBlocksCache) =>
    PatchBlocksCache.instances.push(blocksPatch),
  )
}

export class PatchBaseCache extends PatchCache {
  // eslint-disable-next-line no-use-before-define
  static instances: PatchBaseCache[] = []
  static override bbox = new Box3()
  static cacheRadius = 20
  static batch: {
    currentStep: BatchProcessStep
    startTime: number
    totalElapsedTime: number
    count: number
    totalCount: number
    // eslint-disable-next-line no-use-before-define
    regular: PatchBaseCache[]
    // eslint-disable-next-line no-use-before-define
    transition: PatchBaseCache[]
    // eslint-disable-next-line no-use-before-define
    skipped: PatchBaseCache[]
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
  biomeType: BiomeType // biome value at patch center

  state = PatchState.Empty
  isBiomeTransition = false
  isTransitionPatch = false
  isCloseToRefPatch = false

  constructor(patchOrigin: Vector2) {
    super(patchOrigin)
    // init patch biome
    const patchCenter = this.bbox.getCenter(new Vector3())
    this.biomeType = Biome.instance.getBiomeType(patchCenter)
    this.isBiomeTransition = !!getPatchPoints(this.bbox).find(
      point => Biome.instance.getBiomeType(point) !== this.biomeType,
    )
  }

  static override getPatch(inputPoint: Vector2 | Vector3) {
    return super.getPatch(inputPoint, this.instances) as PatchBaseCache
  }

  static override getPatches(inputBbox: Box3) {
    return super.getPatches(inputBbox, this.instances) as PatchBaseCache[]
  }

  override getNearPatches(): PatchBaseCache[] {
    return super.getNearPatches(PatchBaseCache.instances) as PatchBaseCache[]
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

  static updateCache(center: Vector3, syncCache = cacheSyncProvider) {
    const { patchSize } = PatchCache
    const { batch, cacheRadius } = PatchBaseCache
    const cacheSize = patchSize * cacheRadius
    const bbox = new Box3().setFromCenterAndSize(
      center,
      new Vector3(cacheSize, 0, cacheSize),
    )
    bbox.min.x = bbox.min.x - (bbox.min.x % patchSize)
    bbox.min.z = bbox.min.z - (bbox.min.z % patchSize)
    bbox.max.x = bbox.max.x - (bbox.max.x % patchSize) + patchSize
    bbox.max.z = bbox.max.z - (bbox.max.z % patchSize) + patchSize
    bbox.min.x -= bbox.min.x < 0 ? patchSize : 0
    bbox.min.z -= bbox.min.z < 0 ? patchSize : 0
    bbox.min.y = 0
    bbox.max.y = 0

    const prevCenter = PatchBaseCache.bbox.getCenter(new Vector3())
    prevCenter.y = 0
    const nextCenter = bbox.getCenter(new Vector3())

    if (
      PatchBaseCache.instances.length === 0 ||
      (batch.currentStep === BatchProcessStep.Done &&
        nextCenter.distanceTo(prevCenter) > patchSize)
    ) {
      PatchBaseCache.bbox = bbox
      const created: PatchBaseCache[] = []
      const existing: PatchBaseCache[] = []
      for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
        for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
          const patchStart = new Vector2(xmin, zmin)
          // look for existing patch in current cache
          let patch = PatchBaseCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch || patch.state < PatchState.Final) {
            patch = new PatchBaseCache(patchStart)
            created.push(patch)
          } else {
            existing.push(patch)
          }
        }
      }
      const removedCount = PatchBaseCache.instances.length - existing.length
      PatchBaseCache.instances = [...existing, ...created]
      const { batch } = PatchBaseCache

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
      // PatchBaseCache.processBatch(batch)
      // PatchBaseCache.cacheExtEntities()
      if (created.length > 0) {
        console.log(
          `[PatchBaseCache:update] START patch cache updating: enqueud ${created.length}, kept ${existing.length}, removed ${removedCount} )`,
        )
        syncCache({ kept: existing })
        batch.count = 0
        batch.totalCount = 0
        batch.startTime = Date.now()
        batch.totalElapsedTime = 0
        batch.currentStep = BatchProcessStep.RegularGen
        const promise = new Promise(resolve => {
          const wrapper = (batch: any) =>
            batch.created || batch.kept ? syncCache(batch) : resolve(true)
          PatchBaseCache.buildNextPatch(wrapper)
        })

        return promise
      }
    }
    return null
  }

  static buildNextPatch(syncCache: any) {
    const { batch } = PatchBaseCache
    switch (batch.currentStep) {
      case BatchProcessStep.RegularGen: {
        const nextPatch = batch.regular.shift()
        if (nextPatch) {
          const blocksPatch = nextPatch.genGroundBlocks()
          nextPatch.genEntitiesBlocks(blocksPatch, nextPatch.spawnedEntities)
          syncCache({ created: [blocksPatch] })
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
          const blocksPatch = nextPatch.genGroundBlocks()
          nextPatch.genEntitiesBlocks(blocksPatch, nextPatch.spawnedEntities)
          syncCache({ created: [blocksPatch] })
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
        const count = PatchBaseCache.cacheExtEntities()
        const elapsedTime = Date.now() - batch.startTime
        console.log(`postprocessed ${count} patches in ${elapsedTime}ms`)
        batch.totalElapsedTime += elapsedTime
        const avgTime = Math.round(batch.totalElapsedTime / batch.totalCount)
        console.log(
          `[PatchBaseCache:buildNextPatch] DONE processed ${batch.totalCount} patches in ${batch.totalElapsedTime} ms (avg ${avgTime} ms per patch) `,
        )
        syncCache({})
        batch.currentStep = BatchProcessStep.Done
        break
      }
    }
    if (batch.currentStep !== BatchProcessStep.Done)
      setTimeout(() => PatchBaseCache.buildNextPatch(syncCache), 0)
  }

  static cacheExtEntities() {
    const patchCount = PatchBaseCache.instances
      .map(patch => patch.cacheExtEntities())
      .filter(val => val).length
    return patchCount
  }

  buildRefPoints() {
    const refPatches: PatchBaseCache[] = []
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

  *overBlocksIter() {
    const entities = this.getEntities()
    for (const entity of entities) {
      const blocksIter = PatchBlocksCache.getPatch(
        this.bbox.getCenter(new Vector3()),
      ).getBlocks(entity.bbox)
      // let item: BlockIteratorRes = blocksIter.next()
      for (const block of blocksIter) {
        const overBlocksBuffer = Vegetation.instance.fillBuffer(
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

  static genOvergroundBlocks(baseBlock: BlockData) {
    // find patch containing point in cache
    const patch = this.getPatch(baseBlock.pos)
    const buffer: BlockType[] = []
    if (patch) {
      const pos = baseBlock.pos.clone()
      pos.y = baseBlock.pos.y
      patch
        .getEntities()
        .filter(entity => entity.bbox.containsPoint(pos))
        .forEach(entity => Vegetation.instance.fillBuffer(pos, entity, buffer))
    }
    return buffer
  }

  genEntitiesBlocks(blocksPatch: PatchBlocksCache, entities: EntityData[]) {
    blocksPatch.entitiesChunks = entities.map(entity => {
      const blocksIter = blocksPatch.getBlocks(entity.bbox)
      // let item: BlockIteratorRes = blocksIter.next()
      const chunk: EntityChunk = {
        bbox: new Box3(),
        data: [],
      }

      for (const block of blocksIter) {
        const blocksBuffer = Vegetation.instance.fillBuffer(
          block.pos,
          entity,
          [],
        )
        this.bbox.max.y = Math.max(
          this.bbox.max.y,
          block.pos.y + blocksBuffer.length,
        )
        const serialized = blocksBuffer
          .reduce((str, val) => str + ',' + val, '')
          .slice(1)
        chunk.data.push(serialized)
        chunk.bbox.expandByPoint(block.pos)
      }
      blocksPatch.bbox.max.y = this.bbox.max.y
      chunk.bbox = entity.bbox
      return chunk
    })
  }

  /**
   * Gen blocks data that will be sent to blocks cache
   */
  genGroundBlocks() {
    const { min, max } = this.bbox
    const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
    const prng = alea(patchId)
    const refPoints = this.isTransitionPatch ? this.buildRefPoints() : []
    const blocksPatch = new PatchBlocksCache(new Vector2(min.x, min.z))
    const blocksPatchIter = blocksPatch.iterator()
    min.y = 512
    max.y = 0
    let blockIndex = 0

    for (const blockData of blocksPatchIter) {
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
      blocksPatch.writeBlockAtIndex(blockIndex, blockData.pos.y, blockData.type)
      blockIndex++
    }
    blocksPatch.bbox.min = min
    blocksPatch.bbox.max = max
    this?.bbox.getSize(this.dimensions)
    PatchBaseCache.bbox.union(this.bbox)
    PatchBlocksCache.bbox = PatchBaseCache.bbox
    this.state = PatchState.Filled
    return blocksPatch
  }
}
