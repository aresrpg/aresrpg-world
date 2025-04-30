import { Box2, Vector2 } from 'three'

import { SpawnCategory, SpawnType, SpriteType } from '../utils/common_types.js'
import { NoiseLayerData, RangesLinkedList } from '../datacontainers/LinkedList.js'
import Alea from '../libs/alea.js'
import { SpawnInventory } from '../factory/SpawnInventory.js'
import { SpawnChunk, SpawnData } from '../factory/ChunksFactory.js'
import { asBox2, asVect3 } from '../utils/patch_chunk.js'

import { SparseDistributionMap, SlotSize } from './SparseDistributionMap.js'
import { Noise2dSampler } from './NoiseSampler.js'
import { Ground } from './Ground.js'
import { Biome } from './Biome.js'

export enum DistributionMode {
    SPARSE = 'sparse',
    ZONES = 'zones',
}

export type SpawnSlot = {
    pos: Vector2
    randomIndex: number
}

export type SpawnRules = {
    overlapTolerance: number // how much another item can overlap with current (0: nothing, 1: all)
    overlapProbability: number // how often another item can overlap with current (0: never, 1: all time)
    // experimental/ideas
    // nearSearchRadius?: number    // radius to look around item
    // nearOccurencesLimit?: number    // max number of items that can appear within nearSearchRadius (undef=>no limit, 0: unique (for village church, castle, ...), )
}

/**
 * Spawn type provider
 */
export abstract class SpawnTypeLayer<T extends SpawnType | SpriteType> {
    getRandomNumber(spawnPos: Vector2) {
        const { x, y } = spawnPos
        const posId = `${x}:${y}`
        const prng = Alea(posId)
        const rand = prng()
        return rand
    }

    abstract pickSpawnType(spawnPos: Vector2, spawnProbability: number): T | null
}

type SpawnTypeData = {
    spawnType: SpawnType
    spawnWeight: number
    spawnSize: SlotSize
}
type SparseLayerData = NoiseLayerData<SpawnTypeData>

export class SpawnSparseArea extends SpawnTypeLayer<SpawnType> {
    spawnTypesIndex: Record<SpawnType, number> = {}
    sizeWeightRanks: Record<SlotSize, number> = {
        [SlotSize.Size64]: 0,
        [SlotSize.Size48]: 0,
        [SlotSize.Size32]: 0,
        [SlotSize.Size24]: 0,
        [SlotSize.Size16]: 0,
        [SlotSize.Size12]: 0,
        [SlotSize.Size8]: 0,
        [SlotSize.Size4]: 0,
    }

    rankedSpawnTypes: RangesLinkedList<SparseLayerData>

    private constructor(rankedSpawnTypes: RangesLinkedList<SparseLayerData>) {
        super()
        this.rankedSpawnTypes = rankedSpawnTypes
        // fill spawn size index
        for (const sizeRank of Object.keys(this.sizeWeightRanks)) {
            const rankSize = parseInt(sizeRank)
            let rank = rankedSpawnTypes.first
            while (rank.next && rank.next.data.spawnSize < rankSize) rank = rank.next
            this.sizeWeightRanks[rankSize as SlotSize] = rank.next?.data.threshold || rank.data.threshold + rank.data.spawnWeight
        }
    }

    override pickSpawnType(spawnPos: Vector2, spawnProbability: number, sizeConstraint?: SlotSize) {
        // check if item has spawned
        const rand = this.getRandomNumber(spawnPos)
        const isSpawning = rand <= spawnProbability
        if (isSpawning) {
            //  within range matching size constraint pick random index
            const weightRange = sizeConstraint ? this.sizeWeightRanks[sizeConstraint] : this.sizeWeightRanks[SlotSize.Size64]
            const randomIndex = Math.round(((rand * 10) % 1) * weightRange)
            const matchingRank = this.rankedSpawnTypes.findMatchingElement(randomIndex)
            const selectedSpawnType = matchingRank.data.spawnType
            return selectedSpawnType
        }
        return null
    }

    static async asyncFactory(weightedSpawnTypes: Record<SpawnType, number>) {
        // const sortedSpawnSize = Object.keys(this.spawnSizeIndex)
        //     .map(key => parseInt(key))
        //     .sort((a, b) => b - a)
        const preload = Object.entries(weightedSpawnTypes).map(async ([spawnType, spawnWeight]) => {
            const spawnTemplate = await SpawnInventory.instance.loadTemplate(spawnType)
            if (spawnTemplate) {
                const { spawnRadius, spawnCat } = spawnTemplate.metadata
                const sizeTolerance = spawnCat === SpawnCategory.Flora ? spawnRadius / 5 : 0
                const spawnSize = spawnRadius - sizeTolerance
                // find matching spawn size
                // const spawnSize = sortedSpawnSize.find(spawnSize => size < spawnSize) || 0
                const data: SparseLayerData = {
                    threshold: 0,
                    spawnType,
                    spawnWeight,
                    spawnSize,
                }
                return data
            }
            return null
        })
        const orderedTypesData = (await Promise.all(preload)).filter(val => val) as SparseLayerData[]
        orderedTypesData.sort((a, b) => a.spawnSize - b.spawnSize)
        // fill weight sum field
        let weightSum = 0
        orderedTypesData.forEach(spawnTypeData => {
            spawnTypeData.threshold = weightSum
            weightSum += spawnTypeData.spawnWeight
        })
        const rankedSpawnTypes = RangesLinkedList.fromArrayStub(orderedTypesData)
        return rankedSpawnTypes ? new SpawnSparseArea(rankedSpawnTypes) : null
    }
}

type SpawnSubZoneData<T> = NoiseLayerData<{ spawnType: T }>
type SpawnSubZones<T> = RangesLinkedList<SpawnSubZoneData<T>>

export class SpawnSubZoneLayer<T extends SpawnType | SpriteType> extends SpawnTypeLayer<T> {
    spawnSubZones: SpawnSubZones<T>
    spawnSubZoneDistribution: Noise2dSampler
    constructor(zoneLayerThresholds: Record<T, number>, spawnSubZoneDistribution: Noise2dSampler) {
        super()
        this.spawnSubZoneDistribution = spawnSubZoneDistribution
        const subZonesStub: SpawnSubZoneData<T>[] = Object.entries<number>(zoneLayerThresholds).map(([spawnType, threshold]) => ({
            spawnType,
            threshold,
        })) as SpawnSubZoneData<T>[]
        this.spawnSubZones = RangesLinkedList.fromArrayStub(subZonesStub) as SpawnSubZones<T>
    }

    override pickSpawnType(spawnPos: Vector2, spawnProbability: number) {
        // check if item has spawned
        const rand = this.getRandomNumber(spawnPos)
        const isSpawning = rand <= spawnProbability
        if (isSpawning) {
            // eval noise to determine zone
            const spawnSubzoneNoise = this.spawnSubZoneDistribution.eval(spawnPos)
            const { spawnType } = this.spawnSubZones.findMatchingElement(spawnSubzoneNoise).data
            return spawnType
        }
        return null
    }
}

export type DiscardedSlot = Partial<SpawnData> & {
    spawnStage: number
    spawnPass: number
    bounds?: Box2
}

export class Spawn {
    biome: Biome
    ground: Ground
    sparseDistributionMap: SparseDistributionMap
    spawnDistributionNoise: Noise2dSampler
    constructor(biome: Biome, ground: Ground, sparseMapBaseSize: number, spawnNoiseSeed: string) {
        this.biome = biome
        this.ground = ground
        const patternDimension = new Vector2(1, 1).multiplyScalar(sparseMapBaseSize)
        this.sparseDistributionMap = new SparseDistributionMap(patternDimension)
        this.spawnDistributionNoise = new Noise2dSampler(spawnNoiseSeed)
    }

    getSpawnArea(pos: Vector2) {
        // get biome and land at given block pos
        const biomeType = this.biome.getBiomeType(pos)
        const groundRawVal = this.ground.getRawVal(pos)
        const biomeLand = this.ground.getBiomeLand(biomeType, groundRawVal)
        // retrieve spawn zone from spawn conf at given block pos
        const spawnConf = biomeLand.data.spawn
        const spawnNoiseEval = this.spawnDistributionNoise.eval(pos)
        const mappingZone = spawnConf?.findMatchingElement(spawnNoiseEval)
        // eval spawn probability based on distance from lower/upper thresholds
        if (mappingZone) {
            const nextThreshold = mappingZone.next?.data.threshold || 1
            const zoneSize = nextThreshold - mappingZone.data.threshold
            const zoneMiddle = mappingZone.data.threshold + zoneSize / 2
            const dist = Math.abs(spawnNoiseEval - zoneMiddle)
            const zoneTransition = mappingZone.data.transition || 0.035
            const lowerThresholdDist = spawnNoiseEval - mappingZone.data.threshold
            const upperThresholdDist = nextThreshold - spawnNoiseEval
            // if within zone transition
            const isWithinZoneTransition = lowerThresholdDist < zoneTransition || upperThresholdDist < zoneTransition
            const intensity = 1 - (2 * dist) / zoneSize
            const spawnProbability = isWithinZoneTransition ? intensity : intensity
            const elevation = this.ground.getGroundLevel(pos, groundRawVal)
            return { mappingZone, spawnProbability, elevation }
        }
        return null
    }

    getSchematicType = (pos: Vector2) => {
        const spawnArea = this.getSpawnArea(pos)
        if (spawnArea) {
            const { mappingZone, spawnProbability } = spawnArea
            const schematicsType = mappingZone?.data.schematics?.pickSpawnType(pos, spawnProbability)
            return schematicsType
        }
        return null
    }

    getSpriteType = (pos: Vector2) => {
        const spawnArea = this.getSpawnArea(pos)
        if (spawnArea) {
            const { mappingZone, spawnProbability } = spawnArea
            const spriteType = mappingZone?.data.sprites?.pickSpawnType(pos, spawnProbability)
            return spriteType
        }
        return null
    }

    getSpawnChunk = (pos: Vector2) => {
        const spawnArea = this.getSpawnArea(pos)
        if (spawnArea) {
            const { mappingZone, spawnProbability, elevation } = spawnArea
            const spawnType = mappingZone?.data.schematics?.pickSpawnType(pos, spawnProbability)
            const templateStub = SpawnInventory.instance.catalog[spawnType]
            if (templateStub) {
                // using shared data containers to avoid copying data from original template
                const spawnChunk = new SpawnChunk(templateStub, asVect3(pos, elevation))
                return spawnChunk
            }
        }
        return null
    }

    querySparseChunks = (input: Vector2[] | Box2, spawnInsideAreaOnly = false, skipOverlapPruning = false) => {
        const discardedSlots: DiscardedSlot[] = []
        const spawnSlotsIndex = this.sparseDistributionMap.queryMap(input, spawnInsideAreaOnly)
        const spawnedChunks: SpawnChunk[] = []
        const nonOverlappingChunks: Box2[] = []
        const slotSizes = Object.keys(spawnSlotsIndex)
            .map(key => parseInt(key))
            .sort((a, b) => b - a)
        for (const slotSize of slotSizes) {
            const spawnSlots = spawnSlotsIndex[slotSize as SlotSize] as Vector2[]
            // do first discarding based on spawnOrigin
            const freeSlots = skipOverlapPruning
                ? spawnSlots
                : spawnSlots.filter(slotPos => {
                      const isDiscarded = nonOverlappingChunks.find(item => item.containsPoint(slotPos))
                      isDiscarded &&
                          discardedSlots.push({
                              spawnOrigin: asVect3(slotPos),
                              spawnStage: 0,
                              spawnPass: slotSize,
                          })
                      return !isDiscarded
                  })

            freeSlots.forEach(slotPos => {
                const sparseChunk = this.getSpawnChunk(slotPos)
                if (sparseChunk) {
                    // once spawn type is known do second discarding based on spawned shape
                    const isDiscarded =
                        !skipOverlapPruning && nonOverlappingChunks.find(item => item.intersectsBox(asBox2(sparseChunk.bounds)))
                    isDiscarded
                        ? discardedSlots.push({ ...sparseChunk.toLightStub(), spawnStage: 2, spawnPass: slotSize })
                        : spawnedChunks.push(sparseChunk)
                    // check if picked element is overlapable or not
                    sparseChunk.spawnCat === SpawnCategory.Structure && nonOverlappingChunks.push(asBox2(sparseChunk.bounds))
                }
            })
        }

        return spawnedChunks
    }
}
