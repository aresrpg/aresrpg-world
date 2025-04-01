import { Box2, Vector2 } from 'three'
import PoissonDiskSampling from 'poisson-disk-sampling'
import { getPatchIds } from '../utils/patch_chunk.js'
import Alea from '../third-party/alea.js'
import { ItemSize } from '../factory/ItemsFactory.js'


export type DistributionParams = {
  minDistance: number
  maxDistance?: number
  tries?: number
  distanceFunction?: (point: any) => number
  bias?: number
}

export type DistributionMapElement = {
  pos: Vector2,
  spawnableSizes: ItemSize[]
}


/**
 * Pseudo infinite random distribution from patch repetition
 * with independant and deterministic behavior
 */
export class DiscreteDistributionMap {
  patternDimension: Vector2
  // densityMap: NoiseSampler
  bounds: Box2
  params: DistributionParams
  elements: DistributionMapElement[] = []
  seed

  constructor(dimensions: Vector2, params: DistributionParams, seed: string) {
    this.patternDimension = dimensions
    this.bounds = new Box2(new Vector2(), dimensions)
    this.params = params
    this.seed = seed
    // this.densityMap = new NoiseSampler(params.seed || '')
    this.populateElements()
  }

  get dimensions() {
    return this.bounds.getSize(new Vector2())
  }

  // populate with discrete elements using relative pos
  populateElements() {
    const { dimensions, params, seed } = this
    const prng = Alea(seed || '')
    const p = new PoissonDiskSampling(
      {
        shape: [dimensions.x, dimensions.y],
        ...params,
      },
      prng,
    )
    this.elements = p
      .fill()
      .map(point => {
        const pos = new Vector2(point[0] as number, point[1] as number).round()
        const spawnableSizes = [ItemSize.MEDIUM]
        const mapElement: DistributionMapElement = {
          pos,
          spawnableSizes
        }
        return mapElement
      })
    // this.makeSeamless()
  }

  /**
   * Based on provided items' dimensions, will find all surrounding items overlapping with given point
   * @param searchedArea tested point
   * @param itemDimension max dimensions of items likely to overlap tested point
   */
  queryMapElements(searchedArea: Box2) {
    // get all patterns that can have spawn position within queriedArea
    const patternIds = getPatchIds(searchedArea, this.patternDimension)
    const mapElements: DistributionMapElement[] = []
    for (const patternId of patternIds) {
      // instead of translatting each base elements into pattern's coordinates,
      // reverse translate queried region in base referential then for each point match,
      // translate back into target frame
      const patternOrigin = patternId.clone().multiply(this.patternDimension)
      const localQueriedArea = searchedArea
        .clone()
        .translate(patternOrigin.clone().negate())
      // look for entities overlapping with searched area
      for (const localElement of this.elements) {
        if (localQueriedArea.containsPoint(localElement.pos)) {
          const { } = localElement
          const spawnElement: DistributionMapElement = {
            pos: localElement.pos.clone().add(patternOrigin),
            spawnableSizes: [...localElement.spawnableSizes]
          }
          mapElements.push(spawnElement)
        }
      }
    }
    return mapElements
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
  makeSeamless() {
    const { dimensions, params } = this
    const radius = params.minDistance / 2
    const edgePoints = this.elements
      .map(element => {
        const point = element.pos
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
        return pointCopy.round().equals(point) ? null : { ...element, pos: pointCopy }
      })
      .filter(pointCopy => pointCopy)
    edgePoints.forEach(edgePoint => edgePoint && this.elements.push(edgePoint))
  }

  // DO NOT USE SLOW
  *iterPatchElements(patchOffset: Vector2) {
    // relative to global pos conv
    for (const element of this.elements) {
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
