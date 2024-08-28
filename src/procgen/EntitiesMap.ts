import PoissonDiskSampling from 'poisson-disk-sampling'
import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'
import { EntityType, WorldConfig } from '../index'

import { ProcLayer } from './ProcLayer'
import { BlockType } from './Biome'
// import { Adjacent2dPos } from '../common/types'
// import { getAdjacent2dCoords } from '../common/utils'

export type EntityData = {
  // xzProj: number
  level: number
  type: EntityType
  bbox: Box3
  edgesOverlaps?: any
  params: {
    radius: 5
    size: 10
  }
}

const probabilityThreshold = Math.pow(2, 8)

/**
 * Common interface for querying/iterating entities at block or patch level
 * Custom implementation left to child class
 */
export class EntitiesMap {
  static density = new ProcLayer('treemap')

  probabilityEval(pos: Vector3) {
    const maxCount = 1 // 16 * Math.round(Math.exp(10))
    const val = EntitiesMap.density?.eval(pos)
    const adjustedVal = val
      ? (16 * Math.round(Math.exp((1 - val) * 10))) / maxCount
      : 0
    return adjustedVal
  }

  mergeBuffers(srcBuffer: BlockType[], dstBuffer: BlockType[]) {
    // console.log(`merging buffers: `, srcBuffer, dstBuffer)
    const merged = []
    srcBuffer.reverse()
    dstBuffer.reverse()
    while (srcBuffer.length || dstBuffer.length) {
      const val = srcBuffer.pop() || dstBuffer.pop()
      merged.push(val)
    }
    // console.log(`result: `, merged)
    return merged
  }

  /**
   * all entities belonging or overlapping with given box area
   * or all entities found at given block position
   * @param patchCoords
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  *iterate(_input: Box3 | Vector3) {
    const entities: EntityData[] = []
    // return entities in patch local coords
    for (const entity of entities) {
      yield entity
    }
  }

  /**
   * Randomly spawn entites according to custom distribution
   */
  static spawnEntity(pos: Vector2) {
    // return Math.sin(0.01 * pos.x * pos.y) > 0.99
    const offset = 10
    return pos.x % 20 === offset && pos.y % 20 === offset
  }
}

/**
 * Storing entities on repeatable seamless pattern
 */
export class RepeatableEntitiesMap extends EntitiesMap {
  // eslint-disable-next-line no-use-before-define
  static singleton: RepeatableEntitiesMap
  static get instance() {
    RepeatableEntitiesMap.singleton =
      RepeatableEntitiesMap.singleton || new RepeatableEntitiesMap()
    return RepeatableEntitiesMap.singleton
  }

  // entities stored in pattern
  entities: EntityData[] = []
  // period of repeated pattern
  period
  constructor() {
    super()
    this.period = WorldConfig.patchSize * 2
  }

  // one time init of repeatable pattern
  populate() {
    const { period } = this
    const prng = alea('poisson_disk_sampling')
    const p = new PoissonDiskSampling(
      {
        shape: [period, period],
        minDistance: 8,
        maxDistance: 100,
        tries: 20,
        // distanceFunction: function (p) {
        //   return getImagePixelValueSomehow(p[0], p[1]); // value between 0 and 1
        // }
      },
      prng,
    )
    const points = p.fill()
    this.entities = points.map(point => {
      const mapPos = new Vector3(
        Math.round(point[0] as number),
        0,
        Math.round(point[1] as number),
      )
      // const mapKey = `map_${Math.floor(pos.x / patchSize)}_${Math.floor(pos.y / patchSize)}`
      // const localPos = new Vector3(pos.x % patchSize, 0, pos.y % patchSize)
      const dimensions = new Vector3(10, 0, 10)
      const bbox = new Box3().setFromCenterAndSize(mapPos, dimensions)
      const type = EntityType.NONE
      const entity: EntityData = {
        level: 0,
        type,
        bbox,
        params: {
          radius: 5,
          size: 10,
        },
      }
      return entity
    })
    const edgeEntities = this.entities.filter(
      entity =>
        entity.bbox.min.x < 0 ||
        entity.bbox.min.z < 0 ||
        entity.bbox.max.x > period ||
        entity.bbox.max.z > period,
    )
    edgeEntities.map(entity => {
      const bmin = entity.bbox.min.clone()
      const bmax = entity.bbox.max.clone()
      if (bmin.x < 0) {
        bmin.x += period
        bmax.x += period
      } else if (bmax.x > period) {
        bmin.x -= period
        bmax.x -= period
      }
      if (bmin.z < 0) {
        bmin.z += period
        bmax.z += period
      } else if (bmax.z > period) {
        bmin.z -= period
        bmax.z -= period
      }
      const entityCopy = { ...entity }
      entityCopy.bbox = new Box3(bmin, bmax)
      this.entities.push(entityCopy)
      return entityCopy
    })
  }

  getEntityInstance(entityTemplate: EntityData, mapShifting: Vector3) {
    const mapLocalPos = entityTemplate.bbox.min
    // switch to global position
    const entityDims = entityTemplate.bbox.getSize(new Vector3())
    const bmin = mapShifting.clone().add(mapLocalPos.clone())
    const bmax = bmin.clone().add(entityDims)
    const bbox = new Box3(bmin, bmax)
    const entityInstance = { ...entityTemplate }
    entityInstance.bbox = bbox
    return entityInstance
  }

  hasEntitySpawned(entityInstance: EntityData) {
    const centerPos = entityInstance.bbox.getCenter(new Vector3())
    // eval spawn probability at entity center
    const spawnProbabilty = this.probabilityEval(centerPos)
    const entityId = centerPos.x + '_' + centerPos.z
    const prng = alea(entityId)
    const hasSpawned = prng() * spawnProbabilty < probabilityThreshold
    return hasSpawned
  }

  override *iterate(input: Box3 | Vector3, entityMask = (_entity: EntityData) => false) {
    if (this.entities.length === 0) RepeatableEntitiesMap.instance.populate()
    const { period } = this
    const realPos = input instanceof Box3 ? input.min : input
    const mapShift = new Vector3(
      Math.floor(realPos.x / period),
      0,
      Math.floor(realPos.z / period),
    ).multiplyScalar(period)
    const mapDims =
      input instanceof Box3
        ? input.getSize(new Vector3())
        : new Vector3(1, 1, 1)
    const mapVirtualStart = realPos.clone().sub(mapShift)
    const mapVirtualEnd = mapVirtualStart.clone().add(mapDims)
    mapVirtualStart.y = 0
    mapVirtualEnd.y = 512
    const mapVirtualBox = new Box3(mapVirtualStart, mapVirtualEnd)
    // filter entities belonging to map area
    const entities = this.entities.filter(entity =>
      mapVirtualBox
        ? entity.bbox.intersectsBox(mapVirtualBox)
        : entity.bbox.containsPoint(input as Vector3),
    ).filter(entity => !entityMask(entity))// discard entities according to optional provided mask

    for (const entityTemplate of entities) {
      const entityInstance = this.getEntityInstance(entityTemplate, mapShift)
      if (this.hasEntitySpawned(entityInstance)) {
        yield entityInstance
      }
    }
  }
}

/**
 * Storing entities at biome level with overlap at biomes' transitions
 */
export class OverlappingEntitiesMap extends EntitiesMap {
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
  //   const adjacentMaps = adjacentKeys.map(mapKey => EntitiesMap.mapsLookup[mapKey])
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
