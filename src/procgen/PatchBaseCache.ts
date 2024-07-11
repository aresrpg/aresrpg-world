import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { getPatchPoints } from '../common/utils'
import { Heightmap, PatchCache } from '../index'
import { TreeType } from '../tools/TreeGenerator'

import { Biome, BiomeType, BlockType } from './Biome'
import { EntityChunk, PatchBlocksCache } from './PatchBlocksCache'
import { PatchBatchProcessing } from './PatchBatchProcessing'
import { EntityData, Vegetation } from './Vegetation'

export type BlockData = {
  pos: Vector3
  type: BlockType
  localPos?: Vector3
  buffer?: BlockType[]
}

export type BlockIteratorRes = IteratorResult<BlockData, void>

export enum PatchState {
  Empty,
  Filled,
  Finalised,
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
  static pendingUpdate = false

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
    this.finalisePatches()
    return [...this.spawnedEntities, ...this.extEntities]
  }

  static async updateCache(center: Vector3, cacheSync = cacheSyncProvider, asyncMode = false) {
    const { patchSize } = PatchCache
    const { cacheRadius } = PatchBaseCache
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
      (!this.pendingUpdate && nextCenter.distanceTo(prevCenter) > patchSize)
    ) {
      this.pendingUpdate = true
      PatchBaseCache.bbox = bbox
      const created: PatchBaseCache[] = []
      const existing: PatchBaseCache[] = []
      for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
        for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
          const patchStart = new Vector2(xmin, zmin)
          // look for existing patch in current cache
          let patch = PatchBaseCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch || patch.state < PatchState.Finalised) {
            patch = new PatchBaseCache(patchStart)
            created.push(patch)
          } else {
            existing.push(patch)
          }
        }
      }
      // const updated = existing.filter(patch => patch.state < PatchState.Finalised)
      const removedCount = PatchBaseCache.instances.length - existing.length
      PatchBaseCache.instances = [...existing, ...created]
      const batchPatches: PatchBlocksCache[] = []
      if (created.length > 0) {
        console.log(
          `[PatchBaseCache:update] enqueud ${created.length} new patches, kept ${existing.length}, removed ${removedCount} )`,
        )
        cacheSync({ kept: existing })
        const batchProcess = new PatchBatchProcessing(created)

        // const batchIterator = patchBatch.getBatchIterator();
        const regularPatchIter = batchProcess.iterRegularPatches(asyncMode)
        for await (const batchRes of regularPatchIter) {
          batchPatches.push(batchRes)
          cacheSync({ created: [batchRes] })
        }
        const transitPatchIter = batchProcess.iterTransitionPatches(asyncMode)
        for await (const batchRes of transitPatchIter) {
          batchPatches.push(batchRes)
          cacheSync({ created: [batchRes] })
        }
        PatchBaseCache.instances
          .filter(patch => patch.state < PatchState.Finalised)
          .forEach(patch => patch.finalisePatches())
        batchProcess.finaliseBatch()
        cacheSync({ kept: existing, created: batchPatches })
        this.pendingUpdate = false
      }
      return { kept: existing, created: batchPatches }
    }
    return null
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

  genEntitiesBlocks(
    blocksPatch: PatchBlocksCache,
    entities: EntityData[] = [...this.spawnedEntities, ...this.extEntities],
  ) {
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

  finalisePatches() {
    const nearPatches = this.getNearPatches()
    // skip patches with incomplete edge patches count
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
      this.state = PatchState.Finalised // isFinal ? PatchState.Final : PatchState.Done
      return true
    }
    // else {
    //   console.log(`incomplete patch edges count: ${nearPatches.length}`)
    // }
    return false
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
