import { Box2, Vector2 } from 'three'

import {
  BlueNoiseParams,
  BlueNoisePattern,
} from '../procgen/BlueNoisePattern.js'
import { asVect3, getPatchIds } from '../utils/patch_chunk.js'
import { ItemType } from '../utils/common_types.js'
import Alea from '../third-party/alea.js'
import { NoiseSampler } from '../procgen/NoiseSampler.js'

const distDefaults = {
  aleaSeed: 'treeMap',
  maxDistance: 100,
  tries: 20,
}

export enum DistributionProfile {
  SMALL,
  MEDIUM,
  LARGE,
}

// export type DistributionParams = {
//   noise: BlueNoiseParams,
//   period: number
// }

export const DistributionProfiles: Record<
  DistributionProfile,
  BlueNoiseParams
> = {
  [DistributionProfile.SMALL]: {
    ...distDefaults,
    minDistance: 4,
  },
  [DistributionProfile.MEDIUM]: {
    ...distDefaults,
    minDistance: 8,
  },
  [DistributionProfile.LARGE]: {
    ...distDefaults,
    minDistance: 16,
  },
}

const probabilityThreshold = Math.pow(2, 8)

/**
 * Pseudo infinite random distribution from patch repetition
 * with independant and deterministic behavior
 */
export class RandomDistributionMap {
  patternDimension: Vector2
  repeatablePattern: BlueNoisePattern
  densityMap: NoiseSampler

  constructor(
    dimensions: Vector2,
    bNoiseParams: BlueNoiseParams = DistributionProfiles[
      DistributionProfile.MEDIUM
    ],
  ) {
    this.patternDimension = dimensions
    const bounds = new Box2(new Vector2(), dimensions)
    this.repeatablePattern = new BlueNoisePattern(bounds, bNoiseParams)
    this.densityMap = new NoiseSampler(bNoiseParams.aleaSeed || '')
  }

  spawnProbabilityEval = (pos: Vector2) => {
    const maxCount = 1 // 16 * Math.round(Math.exp(10))
    const val = this.densityMap?.eval(asVect3(pos))
    const adjustedVal = val
      ? (16 * Math.round(Math.exp((1 - val) * 10))) / maxCount
      : 0
    return adjustedVal
  }

  /**
   * Based on provided items' dimensions, will find all surrounding items overlapping with given point
   * @param searchedArea tested point
   * @param itemDimension max dimensions of items likely to overlap tested point
   */
  querySpawnLocations(searchedArea: Box2) {
    // get all patterns that can have spawn position within queriedArea
    const patternIds = getPatchIds(searchedArea, this.patternDimension)
    const spawnLocations: Vector2[] = []
    for (const patternId of patternIds) {
      // instead of translatting each base elements into pattern's coordinates,
      // reverse translate queried region in base referential then for each point match,
      // translate back into target frame
      const patternOrigin = patternId.clone().multiply(this.patternDimension)
      const localQueriedArea = searchedArea
        .clone()
        .translate(patternOrigin.clone().negate())
      // look for entities overlapping with searched area
      for (const spawnLocalPos of this.repeatablePattern.elements) {
        if (localQueriedArea.containsPoint(spawnLocalPos)) {
          const spawnPos = spawnLocalPos.clone().add(patternOrigin)
          spawnLocations.push(spawnPos)
        }
      }
    }
    return spawnLocations
  }

  getSpawnedItem(
    itemPos: Vector2,
    spawnableItems: ItemType[],
    spawnProbabilityEval = this.spawnProbabilityEval,
  ) {
    // const spawnedItems: Record<ItemType, Vector2[]> = {}
    const itemsCount = spawnableItems.length
    // spawnablePlaces.forEach(itemPos => {
    const itemId = itemPos.x + ':' + itemPos.y
    const prng = Alea(itemId)
    const rand = prng()
    const hasSpawned =
      rand * spawnProbabilityEval(itemPos) < probabilityThreshold
    if (hasSpawned) {
      const itemIndex = Math.round(rand * itemsCount * 10)
      const itemKey = spawnableItems[itemIndex % itemsCount] as ItemType
      // if (itemKey !== undefined) {
      //   spawnedItems[itemKey] = spawnedItems[itemKey] || [];
      //   (spawnedItems[itemKey] as Vector2[]).push(itemPos)
      // }
      return itemKey
    }
    // })
    return null
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
  // static biomeMapsLookup: Record<string, EntityData[]> = {}
  // getAdjacentEntities() {
  //   const adjacentEntities = []
  //   const adjacentKeys = Object.values(SurfaceNeighbour)
  //     .filter(v => !isNaN(Number(v)) && v !== SurfaceNeighbour.center)
  //     .map(adjKey => {
  //       const adjCoords = getAdjacent2dCoords(patchCoords, adjKey as SurfaceNeighbour)
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
