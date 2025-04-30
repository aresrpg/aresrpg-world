import { Box2, Vector2 } from 'three'
import PoissonDiskSampling from 'poisson-disk-sampling'

import { getPatchIds } from '../utils/patch_chunk.js'
import Alea from '../libs/alea.js'
import { isNotWorkerEnv } from '../utils/misc_utils.js'
import { WorldGlobals } from '../config/WorldEnv.js'

export type DistributionParams = {
    minDistance: number
    maxDistance?: number
    tries?: number
    distanceFunction?: (point: any) => number
    bias?: number
    maxElementSize?: number // will generate all multiple of minDistance until maxElementSize is reached
}

export enum SlotSize {
    'Size64' = 64,
    'Size48' = 48,
    'Size32' = 32,
    'Size24' = 24,
    'Size16' = 16,
    'Size12' = 12,
    'Size8' = 8,
    'Size4' = 4,
}

/**
 * Pseudo-random distribution made from infinitely repeatable patterns
 * providing independant and deterministic behavior
 */
export class SparseDistributionMap {
    patternDimension: Vector2
    // densityMap: NoiseSampler
    bounds: Box2
    samplesIndex: Record<SlotSize, Vector2[]> = {
        [SlotSize.Size64]: [],
        [SlotSize.Size48]: [],
        [SlotSize.Size32]: [],
        [SlotSize.Size24]: [],
        [SlotSize.Size16]: [],
        [SlotSize.Size12]: [],
        [SlotSize.Size8]: [],
        [SlotSize.Size4]: []
    }
    name

    constructor(dimensions: Vector2, name = '') {
        this.patternDimension = dimensions
        this.bounds = new Box2(new Vector2(), dimensions)
        this.name = name
        // this.densityMap = new NoiseSampler(params.seed || '')
        this.populateSamplesIndex()
    }

    get dimensions() {
        return this.bounds.getSize(new Vector2())
    }

    get samplesCount() {
        return 0
    }

    genPassSamples(slotSize: SlotSize, previousPoints: Vector2[]) {
        const debugLogs = WorldGlobals.instance.debug.logs
        const { dimensions, name } = this
        const prng = Alea(name || '')
        const shape = [dimensions.x, dimensions.y]
        const minDistance = Math.round(slotSize * 1.4)
        const maxDistance = slotSize * 4
        const tries = 20
        const params = {
            shape,
            minDistance,
            maxDistance,
            tries,
        }

        debugLogs &&
            isNotWorkerEnv() &&
            console.log(`generating map distribution for spawnRadius ${slotSize}, minDistance: ${minDistance}`)
        const generator = new PoissonDiskSampling(params, prng)
        previousPoints.map(point => [point.x, point.y]).forEach(point => generator.addPoint(point))

        const samples: Vector2[] = []
        let sample
        while ((sample = generator.next())) {
            const [x, y] = sample
            const point = new Vector2(x, y).round()
            samples.push(point)
        }
        debugLogs && isNotWorkerEnv() && console.log(`samples count: ${samples.length}, total: ${this.samplesCount}`)
        this.samplesIndex[slotSize] = samples
        return samples
    }

    // populate with discrete elements using relative pos
    populateSamplesIndex() {
        const samplingPasses = Object.keys(this.samplesIndex)
        const points = [new Vector2(0, 0)]
        samplingPasses
            // .filter(sampleSize => sampleSize >= 64)
            .forEach(samplePass => points.push(...this.genPassSamples(parseInt(samplePass), points)))
    }

    // queryInvertedSlots(bounds: Box2) {
    //     const invertedSpawnSlots = []
    //     const spawnSlots = this.querySpawnSlots(bounds, true)
    //     const posIndex: Record<string, boolean> = {}
    //     Object.values(spawnSlots).forEach(list => {
    //         list.map(pos => `${pos.x}:${pos.y}`).forEach(posKey => (posIndex[posKey] = true))
    //     })
    //     const patch = new PatchContainer(bounds)
    //     for (const { pos } of patch.iterData()) {
    //         const neighbours = getPatchNeighbours(pos)
    //         const match = neighbours.map(({ x, y }) => `${x}:${y}`).find(posKey => posIndex[posKey])
    //         if (!match) invertedSpawnSlots.push(pos)
    //     }
    //     return invertedSpawnSlots
    // }

    /**
     * Based on provided items' dimensions, will find all surrounding items overlapping with given point
     * @param searchedArea tested point
     * @param itemDimension max dimensions of items likely to overlap tested point
     */
    queryMap(mapQuery: Vector2[] | Box2, slotsInsideAreaOnly = false) {
        const slotsIndex: Partial<Record<SlotSize, Vector2[]>> = {}
        for (const [slotType, patternSamples] of Object.entries(this.samplesIndex)) {
            const slotSize = parseInt(slotType)
            const searchedArea = mapQuery instanceof Box2 ? mapQuery.clone() : new Box2().setFromPoints(mapQuery)
            !slotsInsideAreaOnly && searchedArea.expandByScalar(slotSize)
            // get all patterns that can have spawn position within queriedArea
            const mapPatterns = getPatchIds(searchedArea, this.patternDimension)
            const spawnSlots: Vector2[] = []
            for (const patternId of mapPatterns) {
                // instead of translatting each base elements into pattern's coordinates,
                // reverse translate queried region in base referential then for each point match,
                // translate back into target frame
                const patternOrigin = patternId.clone().multiply(this.patternDimension)
                const localArea = searchedArea.clone().translate(patternOrigin.clone().negate())
                // look for entities overlapping with searched area
                patternSamples
                    .filter(localPos => localArea.containsPoint(localPos))
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
            slotsIndex[slotSize as SlotSize] = spawnSlots
        }
        // console.log(spawnSlotsIndex)
        return slotsIndex
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
    // *iterPatchElements(patchOffset: Vector2) {
    //   // relative to global pos conv
    //   for (const element of this.patternElements) {
    //     const localPos = element.pos
    //     const worldPos = this.toWorldPos(localPos, patchOffset)
    //     yield worldPos
    //   }
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
