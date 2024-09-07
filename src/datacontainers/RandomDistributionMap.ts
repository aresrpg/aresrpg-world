import alea from 'alea'
import { Box2, Vector2 } from 'three'

import { ProcLayer } from '../procgen/ProcLayer'
import { BlueNoisePattern } from '../procgen/BlueNoisePattern'
import { EntityData } from '../common/types'
import { WorldConf } from '../index'

import { PatchesMapBase } from './DataContainers'
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
export class PseudoDistributionMap extends PatchesMapBase {
  repeatedPattern: BlueNoisePattern
  densityMap: ProcLayer

  constructor(
    bbox: Box2 = distMapDefaultBox,
    distParams: any = distMapDefaults,
  ) {
    super(bbox.getSize(new Vector2()))
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

  /**
   *
   * @param entityShaper
   * @param inputPointOrArea either test point or range box
   * @param spawnProbabilityOverride
   * @returns all locations from which entity contains input point or overlaps with range box
   */
  querySpawnLocations(
    testRange: Vector2 | Box2,
    overlapsTest: (testRange: Box2, entityPos: Vector2) => boolean,
    spawnProbabilityOverride?: (entityPos?: Vector2) => number,
    // entityMask = (_entity: EntityData) => false
  ) {
    const testBox =
      testRange instanceof Box2
        ? testRange
        : new Box2().setFromPoints([testRange])
    // const offset = testBox.min.clone().divide(this.patchDimensions).floor().multiply(this.patchDimensions)
    // const localTestBox = testBox.clone().translate(offset.clone().negate())
    // const overlappingEntities = this.repeatedPattern.elements
    //   .filter(entityPos => overlapsTest(localTestBox, entityPos))
    //   .map(relativePos => relativePos.clone().add(offset))
    const overlappingEntities: Vector2[] = []
    const patchIds = this.getPatchIds(testBox)
    for (const patchId of patchIds) {
      const offset = patchId.clone().multiply(this.patchDimensions)
      const localTestBox = testBox.clone().translate(offset.clone().negate())
      // look for entities overlapping with input point or area
      for (const relativePos of this.repeatedPattern.elements) {
        if (overlapsTest(localTestBox, relativePos)) {
          const entityPos = relativePos.clone().add(offset)
          overlappingEntities.push(entityPos)
        }
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
