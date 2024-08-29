import PoissonDiskSampling from 'poisson-disk-sampling'
import alea from 'alea'
import { Box2, Box3, Vector2 } from 'three'

import { ProcLayer } from './ProcLayer'
import { EntityData } from '../common/types'
import { WorldConfig } from '../config/WorldConfig'
import { patchIdFromPos } from '../common/utils'
// import { Adjacent2dPos } from '../common/types'
// import { getAdjacent2dCoords } from '../common/utils'

const probabilityThreshold = Math.pow(2, 8)
const bmin = new Vector2(0, 0)
const bmax = new Vector2(WorldConfig.defaultDistMapPeriod, WorldConfig.defaultDistMapPeriod)
const distMapDefaultBox = new Box2(bmin, bmax)
const distMapDefaults = {
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
  bbox: Box2
  params
  points: Vector2[] = []
  densityMap = new ProcLayer('treemap')

  constructor(bbox: Box2 = distMapDefaultBox, distParams: any = distMapDefaults) {
    this.bbox = bbox
    this.params = distParams
  }

  get dimensions() {
    return this.bbox.getSize(new Vector2())
  }

  populate() {
    const { dimensions, params } = this
    const prng = alea('RandomDistributionMap')
    const p = new PoissonDiskSampling(
      {
        shape: [dimensions.x, dimensions.y],
        ...params
      },
      prng,
    )
    this.points = p.fill()
      .map(point =>
        new Vector2(point[0] as number, point[1] as number).round())
    // make seamless repeatable map

    const radius = params.minDistance / 2
    const edgePoints = this.points
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
    edgePoints.forEach(edgePoint => edgePoint && this.points.push(edgePoint))
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
    spawnProbabilty = spawnProbabilty && !isNaN(spawnProbabilty) ? spawnProbabilty : this.spawnProbabilityEval(itemPos)
    const itemId = itemPos.x + ':' + itemPos.y
    const prng = alea(itemId)
    const hasSpawned = prng() * spawnProbabilty < probabilityThreshold
    return hasSpawned
  }

  /**
   * 
   * @param entityShaper 
   * @param inputPointOrRange either test point or range box
   * @param spawnProbabilityOverride 
   * @returns all locations from which entity contains input point or overlaps with range box
   */
  getSpawnLocations(entityShaper: (centerPos: Vector2) => Box2,
    inputPointOrRange: Vector2 | Box2,
    spawnProbabilityOverride?: (entityPos?: Vector2) => number,
    // entityMask = (_entity: EntityData) => false
  ) {
    const { dimensions } = this
    const inputBox = inputPointOrRange instanceof Box2 ? inputPointOrRange :
      new Box2().setFromPoints([inputPointOrRange])
    const mapRangeMin = patchIdFromPos(inputBox.min, dimensions)
    const mapRangeMax = inputBox.max.clone().divide(dimensions).ceil()
    const mapOffset = mapRangeMin.clone()
    const candidates: Vector2[] = []
    // iter maps on computed range
    for (mapOffset.x = mapRangeMin.x; mapOffset.x < mapRangeMax.x; mapOffset.x++) {
      for (mapOffset.y = mapRangeMin.y; mapOffset.y < mapRangeMax.y; mapOffset.y++) {
        const posOffset = mapOffset.clone().multiply(dimensions)
        // convet relative pos to global pos
        this.points.map(point => point.clone().add(posOffset))
          .filter(entityPos => {
            const entityBox = entityShaper(entityPos)
            return inputPointOrRange instanceof Vector2 ? entityBox.containsPoint(inputPointOrRange) :
              entityBox.intersectsBox(inputBox)
          })
          .forEach(entityPos => candidates.push(entityPos))
      }
    }
    const spawned = candidates.filter(entityPos => this.hasSpawned(entityPos, spawnProbabilityOverride?.(entityPos)))
    return spawned
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
export class OverlappingEntitiesMap { //extends RandomDistributionMap {
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
