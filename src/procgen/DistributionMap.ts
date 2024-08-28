import PoissonDiskSampling from 'poisson-disk-sampling'
import alea from 'alea'
import { Box2, Vector2, Vector3 } from 'three'

import { ProcLayer } from './ProcLayer'
import { EntityData } from '../common/types'
// import { Adjacent2dPos } from '../common/types'
// import { getAdjacent2dCoords } from '../common/utils'

const probabilityThreshold = Math.pow(2, 8)
const distMapDefaults = {
  minDistance: 8,
  maxDistance: 100,
  tries: 20,
}

/**
 * Map for querying/iterating randomly distributed items 
 * at block level or from custom box range 
 */
export class RandomDistributionMap {
  bbox: Box2
  params
  points: Vector2[] = []
  densityMap = new ProcLayer('treemap')

  constructor(bbox: Box2, distParams: any = {}) {
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
  }

  spawnProbabilityEval(pos: Vector2) {
    const maxCount = 1 // 16 * Math.round(Math.exp(10))
    const val = this.densityMap?.eval(pos)
    const adjustedVal = val
      ? (16 * Math.round(Math.exp((1 - val) * 10))) / maxCount
      : 0
    return adjustedVal
  }

  hasSpawned(itemPos: Vector2) {
    // eval spawn probability at entity center
    const spawnProbabilty = this.spawnProbabilityEval(itemPos)
    const itemId = itemPos.x + ':' + itemPos.y
    const prng = alea(itemId)
    const hasSpawned = prng() * spawnProbabilty < probabilityThreshold
    return hasSpawned
  }

  /**
   * all entities belonging or overlapping with given box area
   * or all entities found at given block position
   * @param patchCoords
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  *iterMapItems(entityShaper: (centerPos: Vector2) => Box2,
    pointOrRange: Vector2 | Box2,
    // spawnProbabilityOverride: (entityPos?: Vector2) => number,
  ) {
    // return entities in patch local coords
    for (const entityPos of this.points) {
      const entityShape = entityShaper(entityPos)
      const isWithinRange = pointOrRange instanceof Box2 ?
        entityShape.intersectsBox(pointOrRange) : entityShape.containsPoint(pointOrRange)
      // TODO eval entity spawn probability here
      if (isWithinRange && this.hasSpawned(entityPos))
        yield entityPos
    }
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
 * Infinite map using repeatable seamless pattern providing
 * independant, deterministic and approximated random distribution
 */
export class PseudoRandomDistMap extends RandomDistributionMap {
  // eslint-disable-next-line no-use-before-define
  static singleton: PseudoRandomDistMap

  constructor(mapPeriod: number, params = distMapDefaults) {
    super(new Box2(new Vector2(0, 0), new Vector2(mapPeriod, mapPeriod)), params)
  }

  static get instance() {
    return PseudoRandomDistMap.singleton
  }

  static set instance(defaultInstance: PseudoRandomDistMap) {
    PseudoRandomDistMap.singleton = defaultInstance
  }

  override populate() {
    super.populate()
    // make seamless repeatable map
    const { dimensions } = this
    const radius = this.params.minDistance / 2
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

  /**
   * Either whole area or individual point overlapping with entity
   * @param input 
   * @param entityMask 
   */
  override *iterMapItems(entityShaper: (centerPos: Vector2) => Box2,
    inputPointOrRange: Vector2 | Box2,
    // spawnProbabilityOverride: (entityPos?: Vector2) => number,
    // entityMask = (_entity: EntityData) => false
  ) {
    const { dimensions } = this
    const mapOrigin = inputPointOrRange instanceof Box2 ? inputPointOrRange.min : inputPointOrRange
    const mapShifting = new Vector2(
      Math.floor(mapOrigin.x / dimensions.x),
      Math.floor(mapOrigin.y / dimensions.y),
    ).multiply(dimensions)
    const mapDims =
      inputPointOrRange instanceof Box2
        ? inputPointOrRange.getSize(new Vector2())
        : new Vector2(1, 1)
    const virtualMapStart = mapOrigin.clone().sub(mapShifting)
    const virtualMapEnd = virtualMapStart.clone().add(mapDims)
    const virtualMapBox = new Box2(virtualMapStart, virtualMapEnd)
    const toRealMapPos = (virtualMapRelativePos: Vector2) =>
      mapShifting.clone().add(virtualMapRelativePos)

    // filter all items belonging to map area or intersecting point
    const pointCandidates = this.points
      .filter(entityCenter => {
        const entityBox = entityShaper(entityCenter)
        return virtualMapBox ? entityBox.intersectsBox(virtualMapBox)
          : entityBox.containsPoint(mapOrigin)
      })
    // .filter(entity => !entityMask(entity))// discard entities according to optional provided mask

    for (const entityCenter of pointCandidates) {
      const entityPos = toRealMapPos(entityCenter)
      if (this.hasSpawned(entityPos)) {
        yield entityPos
      }
    }
  }
}

/**
 * Storing entities at biome level with overlap at biomes' transitions
 */
export class OverlappingEntitiesMap extends RandomDistributionMap {
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
