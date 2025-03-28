import { Box2, Vector2 } from 'three'
import PoissonDiskSampling from 'poisson-disk-sampling'
import { asVect3, getPatchIds } from '../utils/patch_chunk.js'
import { ItemType } from '../utils/common_types.js'
import Alea from '../third-party/alea.js'
import { NoiseSampler } from './NoiseSampler.js'

export type BlueNoiseParams = {
  minDistance: number
  maxDistance?: number
  tries?: number
  distanceFunction?: (point: any) => number
  bias?: number
  aleaSeed?: string
}

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
export class DistributionMap {
  patternDimension: Vector2
  densityMap: NoiseSampler
  bounds: Box2
  params: BlueNoiseParams
  elements: Vector2[] = []

  constructor(
    dimensions: Vector2,
    bNoiseParams: BlueNoiseParams = DistributionProfiles[
      DistributionProfile.MEDIUM
    ],
  ) {
    this.patternDimension = dimensions
    this.bounds = new Box2(new Vector2(), dimensions)
    this.params = bNoiseParams
    this.densityMap = new NoiseSampler(bNoiseParams.aleaSeed || '')
    this.populateElements()
  }

  get dimensions() {
    return this.bounds.getSize(new Vector2())
  }

  // populate with discrete elements using relative pos
  populateElements() {
    const { dimensions, params } = this
    const { aleaSeed } = this.params
    const prng = Alea(aleaSeed || '')
    const p = new PoissonDiskSampling(
      {
        shape: [dimensions.x, dimensions.y],
        ...params,
      },
      prng,
    )
    this.elements = p
      .fill()
      .map(point => new Vector2(point[0] as number, point[1] as number).round())
    // this.makeSeamless()
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
      for (const spawnLocalPos of this.elements) {
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

  getPatchOrigin(patchId: Vector2) {
    return patchId.clone().multiply(this.dimensions)
  }

  toPatchLocalPos(pos: Vector2, patchId: Vector2) {
    return pos.clone().sub(this.getPatchOrigin(patchId))
  }

  toPatchWorldPos(relativePos: Vector2, patchId: Vector2) {
    return relativePos.clone().add(this.getPatchOrigin(patchId))
  }

  // /**
  //  * Randomly spawn entites according to custom distribution
  //  */
  // static spawnEntity(pos: Vector2) {
  //   // return Math.sin(0.01 * pos.x * pos.y) > 0.99
  //   const offset = 10
  //   return pos.x % 20 === offset && pos.y % 20 === offset
  // }

  /**
   * make seamless repeatable pattern
   * DISABLED
   */
  makeSeamless() {
    const { dimensions, params } = this
    const radius = params.minDistance / 2
    const edgePoints = this.elements
      .map(point => {
        const pointCopy = point.clone()
        if (point.x - radius < 0) {
          pointCopy.x += dimensions.x
        } else if (point.x + radius > dimensions.x) {
          pointCopy.x -= dimensions.x
        }
        if (point.y - radius < 0) {
          pointCopy.y += dimensions.y
        } else if (point.y + radius > dimensions.y) {
          pointCopy.y -= dimensions.y
        }
        return pointCopy.round().equals(point) ? null : pointCopy
      })
      .filter(pointCopy => pointCopy)
    edgePoints.forEach(edgePoint => edgePoint && this.elements.push(edgePoint))
  }

  // DO NOT USE SLOW
  *iterPatchElements(patchOffset: Vector2) {
    // relative to global pos conv
    for (const relativePos of this.elements) {
      const pos = this.toPatchWorldPos(relativePos, patchOffset)
      yield pos
    }
  }
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
