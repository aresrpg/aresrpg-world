import alea from 'alea'
import { Box2, Vector2 } from 'three'

import { ProcLayer } from '../procgen/ProcLayer'
import { BlueNoisePattern } from '../procgen/BlueNoisePattern'
import { EntityData } from '../common/types'
import { patchLowerId, patchUpperId } from '../common/utils'
import { WorldConf } from '../index'
// import { Adjacent2dPos } from '../common/types'
// import { getAdjacent2dCoords } from '../common/utils'

const probabilityThreshold = Math.pow(2, 8)
const bmin = new Vector2(0, 0)
const bmax = new Vector2(
  WorldConf.defaultDistMapPeriod,
  WorldConf.defaultDistMapPeriod,
)
const distMapDefaultBox = new Box2(bmin, bmax)
const distMapDefaults = {
  aleaSeed: 'treeMap',
  minDistance: 8,
  maxDistance: 100,
  tries: 20,
}

/**
 * Infinite map using repeatable seamless pattern to provide
 * independant, deterministic and approximated random distribution
 * Enable querying/iterating randomly distributed items at block
 * level or from custom box range
 */
export class PseudoDistributionMap {
  repeatedPattern: BlueNoisePattern
  densityMap: ProcLayer

  constructor(
    bbox: Box2 = distMapDefaultBox,
    distParams: any = distMapDefaults,
  ) {
    this.repeatedPattern = new BlueNoisePattern(bbox, distParams)
    this.densityMap = new ProcLayer(distParams.aleaSeed || '')
  }

  spawnProbabilityEval(pos: Vector2) {
    const maxCount = 1 // 16 * Math.round(Math.exp(10))
    const val = this.densityMap?.eval(pos)
    const adjustedVal = val
      ? (16 * Math.round(Math.exp((1 - val) * 10))) / maxCount
      : 0
    return adjustedVal
  }

  hasSpawned(itemPos: Vector2, spawnProbabilty?: number) {
    // eval spawn probability at entity center
    spawnProbabilty =
      spawnProbabilty && !isNaN(spawnProbabilty)
        ? spawnProbabilty
        : this.spawnProbabilityEval(itemPos)
    const itemId = itemPos.x + ':' + itemPos.y
    const prng = alea(itemId)
    const hasSpawned = prng() * spawnProbabilty < probabilityThreshold
    return hasSpawned
  }

  getPatchIdsRange(mapArea: Box2) {
    const { dimensions } = this.repeatedPattern
    const rangeMin = patchLowerId(mapArea.min, dimensions)
    const rangeMax = patchUpperId(mapArea.max, dimensions)
    return new Box2(rangeMin, rangeMax)
  }

  *iterPatchIds(mapArea: Box2) {
    const patchRange = this.getPatchIdsRange(mapArea)
    const patchOffset = patchRange.min.clone()
    // iter elements on computed range
    for (
      patchOffset.x = patchRange.min.x;
      patchOffset.x < patchRange.max.x;
      patchOffset.x++
    ) {
      for (
        patchOffset.y = patchRange.min.y;
        patchOffset.y < patchRange.max.y;
        patchOffset.y++
      ) {
        yield patchOffset
      }
    }
  }

  /**
   *
   * @param entityShaper
   * @param inputPointOrArea either test point or range box
   * @param spawnProbabilityOverride
   * @returns all locations from which entity contains input point or overlaps with range box
   */
  querySpawnLocations(
    entityShaper: (centerPos: Vector2) => Box2,
    inputPointOrArea: Vector2 | Box2,
    spawnProbabilityOverride?: (entityPos?: Vector2) => number,
    // entityMask = (_entity: EntityData) => false
  ) {
    const mapBox =
      inputPointOrArea instanceof Box2
        ? inputPointOrArea
        : new Box2().setFromPoints([inputPointOrArea])
    const overlappingEntities: Vector2[] = []
    const patchIds = this.iterPatchIds(mapBox)
    for (const patchId of patchIds) {
      const patchElements = this.repeatedPattern.iterPatchElements(patchId)
      // look for entities overlapping with input point or area
      for (const entityPos of patchElements) {
        const entityBox = entityShaper(entityPos)
        const isOverlappingEntity =
          inputPointOrArea instanceof Vector2
            ? entityBox.containsPoint(inputPointOrArea)
            : entityBox.intersectsBox(mapBox)
        if (isOverlappingEntity) overlappingEntities.push(entityPos)
      }
    }
    const spawnedEntities = overlappingEntities.filter(entityPos =>
      this.hasSpawned(entityPos, spawnProbabilityOverride?.(entityPos)),
    )
    return spawnedEntities
  }

  // /**
  //  * Randomly spawn entites according to custom distribution
  //  */
  // static spawnEntity(pos: Vector2) {
  //   // return Math.sin(0.01 * pos.x * pos.y) > 0.99
  //   const offset = 10
  //   return pos.x % 20 === offset && pos.y % 20 === offset
  // }
}

/**
 * Storing entities at biome level with overlap at biomes' transitions
 */
export class OverlappingEntitiesMap {
  // extends RandomDistributionMap {
  // entities stored per biome
  static biomeMapsLookup: Record<string, EntityData[]> = {}
  // getAdjacentEntities() {
  //   const adjacentEntities = []
  //   const adjacentKeys = Object.values(Adjacent2dPos)
  //     .filter(v => !isNaN(Number(v)) && v !== Adjacent2dPos.center)
  //     .map(adjKey => {
  //       const adjCoords = getAdjacent2dCoords(patchCoords, adjKey as Adjacent2dPos)
  //       const mapKey = `map_${adjCoords.x % repeatPeriod}_${adjCoords.y % repeatPeriod}`
  //       return mapKey
  //     })
  //   const adjacentMaps = adjacentKeys.map(mapKey => RandomDistributionMap.mapsLookup[mapKey])
  //   return adjacentEntities
  // }

  // Gen all entities belonging to specific biome
  // populate(blockPos: Vector3) {
  //   // find biome at given block pos
  //   // discover biome extent
  //   // generate entities over all biome
  // }

  // override *iterate(input: Box3 | Vector3) {
  //   // find if biome cached entities exists for given block or patch
  //   // if not populate biomes cache with entities
  //   // if block or patch contained withing unique biome, return matching entities
  //   // else if overlapping across several biomes, compute transition
  // }
}
