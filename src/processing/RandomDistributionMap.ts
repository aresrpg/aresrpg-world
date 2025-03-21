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
export class PseudoDistributionMap {
  patchDim: Vector2
  repeatedPattern: BlueNoisePattern
  densityMap: NoiseSampler

  constructor(
    dimensions: Vector2,
    bNoiseParams: BlueNoiseParams = DistributionProfiles[
      DistributionProfile.MEDIUM
    ],
  ) {
    this.patchDim = dimensions
    const bounds = new Box2(new Vector2(), dimensions)
    this.repeatedPattern = new BlueNoisePattern(bounds, bNoiseParams)
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
   * querying/iterating randomly distributed items at block level or from custom bounds
   * @param entityShaper
   * @param inputPointOrArea either test point or bounds
   * @param spawnProbabilityOverride
   * @returns all entities locations overlapping with input point or bounds
   */
  querySpawnLocations(
    queryBoxOrLoc: Vector2 | Box2,
    itemDims: Vector2,
    // entityMask = (_entity: EntityData) => false
  ) {
    const queryBox =
      queryBoxOrLoc instanceof Box2
        ? queryBoxOrLoc
        : new Box2().setFromPoints([queryBoxOrLoc])
    // const offset = testBox.min.clone().divide(this.patchDimensions).floor().multiply(this.patchDimensions)
    // const localTestBox = testBox.clone().translate(offset.clone().negate())
    // const overlappingEntities = this.repeatedPattern.elements
    //   .filter(entityPos => overlapsTest(localTestBox, entityPos))
    //   .map(relativePos => relativePos.clone().add(offset))
    const spawnLocations: Vector2[] = []
    const patchIds = getPatchIds(queryBox, this.patchDim)
    for (const patchId of patchIds) {
      const offset = patchId.clone().multiply(this.patchDim)
      const localRegionQuery = queryBox
        .clone()
        .translate(offset.clone().negate())
      // look for entities overlapping with input point or area
      for (const spawnLocalPos of this.repeatedPattern.elements) {
        // eval spawn probability at entity center
        const spawnBox = new Box2().setFromCenterAndSize(
          spawnLocalPos,
          itemDims,
        )
        if (spawnBox.intersectsBox(localRegionQuery)) {
          const itemPos = spawnLocalPos.clone().add(offset)
          spawnLocations.push(itemPos)
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
