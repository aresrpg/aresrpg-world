import { Box2, Vector2 } from 'three'
import PoissonDiskSampling from 'poisson-disk-sampling'
import { getPatchIds } from '../utils/patch_chunk.js'
import Alea from '../third-party/alea.js'
import { isNotWorkerEnv } from '../utils/misc_utils.js'
import { WorldGlobals } from '../config/WorldEnv.js'


export type DistributionParams = {
  minDistance: number
  maxDistance?: number
  tries?: number
  distanceFunction?: (point: any) => number
  bias?: number
  maxElementSize?: number  // will generate all multiple of minDistance until maxElementSize is reached
}

type ScalarRange = {
  min: number,
  max: number
}


/**
 * Pseudo-random distribution made from infinitely repeatable patterns
 * with independant and deterministic behavior
 */
export class DiscreteMapDistribution {
  patternDimension: Vector2
  // densityMap: NoiseSampler
  bounds: Box2
  samplesIndex: Record<number, Vector2[]> = {}
  seed

  constructor(dimensions: Vector2, seed: string) {
    this.patternDimension = dimensions
    this.bounds = new Box2(new Vector2(), dimensions)
    this.seed = seed
    // this.densityMap = new NoiseSampler(params.seed || '')
    this.populateSamplesIndex()
  }

  get dimensions() {
    return this.bounds.getSize(new Vector2())
  }

  get samplesCount() {
    return 0
  }

  genSamples(maxSpawnRadius: number, previousPoints: Vector2[]) {
    const debugLogs = WorldGlobals.instance.debug.logs
    const { dimensions, seed } = this
    const prng = Alea(seed || '')
    const shape = [dimensions.x, dimensions.y]
    const minDistance = Math.round(maxSpawnRadius * 1.4)
    const maxDistance = maxSpawnRadius * 4
    const tries = 20
    const params = {
      shape,
      minDistance,
      maxDistance,
      tries,
    }

    debugLogs && isNotWorkerEnv() && console.log(`generating map distribution for spawnRadius ${maxSpawnRadius}, minDistance: ${minDistance}`)
    const generator = new PoissonDiskSampling(params, prng)
    previousPoints.map(point => [point.x, point.y])
      .forEach(point => generator.addPoint(point))

    const samples: Vector2[] = []
    let sample
    while (sample = generator.next()) {
      const [x, y] = sample
      const point = new Vector2(x, y).round()
      samples.push(point)
    }
    debugLogs && isNotWorkerEnv() && console.log(`samples count: ${samples.length}, total: ${this.samplesCount}`)
    this.samplesIndex[maxSpawnRadius] = samples
    return samples
  }

  // populate with discrete elements using relative pos
  populateSamplesIndex() {
    const sampleSizes = [64, 48, 32, 24, 16, 12, 8, 4]
    let points = [new Vector2(0, 0)]
    sampleSizes
      // .filter(sampleSize => sampleSize >= 64)
      .forEach(sampleSize => points.push(...this.genSamples(sampleSize, points)))
  }

  /**
   * Based on provided items' dimensions, will find all surrounding items overlapping with given point
   * @param searchedArea tested point
   * @param itemDimension max dimensions of items likely to overlap tested point
   */
  queryMapSpawnSlots(query: Vector2[] | Box2, maxSearchRadius?: number) {
    const spawnSlotsIndex: Record<number, Vector2[]> = {}
    for (const [spawnRadius, patternSamples] of Object.entries(this.samplesIndex)) {
      const searchedArea = query instanceof Box2 ? query.clone() : new Box2().setFromPoints(query)
      searchedArea.expandByScalar(parseInt(spawnRadius))
      // get all patterns that can have spawn position within queriedArea
      const mapPatterns = getPatchIds(searchedArea, this.patternDimension)
      const spawnSlots: Vector2[] = []
      for (const patternId of mapPatterns) {
        // instead of translatting each base elements into pattern's coordinates,
        // reverse translate queried region in base referential then for each point match,
        // translate back into target frame
        const patternOrigin = patternId.clone().multiply(this.patternDimension)
        const localArea = searchedArea
          .clone()
          .translate(patternOrigin.clone().negate())
        // look for entities overlapping with searched area
        patternSamples.filter(localPos => localArea.containsPoint(localPos))
          .map(localPos => localPos.clone().add(patternOrigin))
          // .filter(spawnSlot => {
          //   if (Array.isArray(query)) {
          //     const isAccepted = query.find(queriedPoint => spawnSlot.distanceTo(queriedPoint) <= parseInt(spawnRadius))
          //     if (!isAccepted) {
          //       rejected++
          //     }
          //     return isAccepted
          //   }
          //   return true
          // })
          .forEach(worldPos => spawnSlots.push(worldPos))
      }
      spawnSlotsIndex[spawnRadius] = spawnSlots
    }
    // console.log(spawnSlotsIndex)
    return spawnSlotsIndex
  }

  getPatchOrigin(patchId: Vector2) {
    return patchId.clone().multiply(this.dimensions)
  }

  toLocalPos(pos: Vector2, patchId: Vector2) {
    return pos.clone().sub(this.getPatchOrigin(patchId))
  }

  toWorldPos(relativePos: Vector2, patchId: Vector2) {
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
  // makeSeamless() {
  //   const { dimensions, params } = this
  //   const radius = params.minDistance / 2
  //   const edgePoints = this.patternElements
  //     .map(element => {
  //       const point = element.pos
  //       const pointCopy = point.clone()
  //       if (point.x - radius < 0) {
  //         pointCopy.x += dimensions.x
  //       } else if (point.x + radius > dimensions.x) {
  //         pointCopy.x -= dimensions.x
  //       }
  //       if (point.y - radius < 0) {
  //         pointCopy.y += dimensions.y
  //       } else if (point.y + radius > dimensions.y) {
  //         pointCopy.y -= dimensions.y
  //       }
  //       return pointCopy.round().equals(point) ? null : { ...element, pos: pointCopy }
  //     })
  //     .filter(pointCopy => pointCopy)
  //   edgePoints.forEach(edgePoint => edgePoint && this.patternElements.push(edgePoint))
  // }

  // DO NOT USE SLOW
  *iterPatchElements(patchOffset: Vector2) {
    // relative to global pos conv
    for (const element of this.patternElements) {
      const localPos = element.pos
      const worldPos = this.toWorldPos(localPos, patchOffset)
      yield worldPos
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
