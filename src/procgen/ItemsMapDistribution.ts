import { Box2, Vector2 } from 'three'

import { WorldLocals, WorldSeed } from '../config/WorldEnv.js'
import { asVect3 } from '../utils/patch_chunk.js'
import Alea from '../third-party/alea.js'

import { NoiseSampler } from './NoiseSampler.js'
import { DiscreteMapDistribution } from './DiscreteMapDistribution.js'
import { Biome } from './Biome.js'
import { Heightmap } from './Heightmap.js'

const SPAWN_INDEX_RANGE = 100

export type MapSpawnedElement = {
    pos: Vector2
    randomIndex: number
}

/**
 * Support for multiple items' sizes
 */
// SpawnDistributionMap
export class ItemsMapDistribution {
    // layers: Record<DistributionProfile, DistributionMap>
    discreteDistributionMap: DiscreteMapDistribution
    spawnDistributionLaw: NoiseSampler
    spawnProbabilityThreshold: number
    biomes: Biome
    heightmap: Heightmap

    constructor(worldLocalEnv: WorldLocals, heightmap: Heightmap, biomes: Biome) {
        const spawnSeed = worldLocalEnv.getSeed(WorldSeed.Spawn)
        const patternDimension = worldLocalEnv.getDistributionMapDimensions()
        this.discreteDistributionMap = new DiscreteMapDistribution(patternDimension, spawnSeed)
        this.spawnDistributionLaw = new NoiseSampler(spawnSeed)
        this.spawnProbabilityThreshold = Math.pow(2, 8)
        this.biomes = biomes
        this.heightmap = heightmap
        // this.layers = {
        //   [DistributionProfile.SMALL]: new DistributionMap(patternDimension, worldLocalEnv.getDistributionProfile(DistributionProfile.SMALL)),
        //   [DistributionProfile.MEDIUM]: new DistributionMap(patternDimension, worldLocalEnv.getDistributionProfile(DistributionProfile.MEDIUM)),
        //   [DistributionProfile.LARGE]: new DistributionMap(patternDimension, worldLocalEnv.getDistributionProfile(DistributionProfile.LARGE))
        // }
    }

    evalSpawnability(pos: Vector2) {
        const { spawnProbabilityThreshold, spawnDistributionLaw } = this
        const posId = pos.x + ':' + pos.y
        const prng = Alea(posId)
        const rand = prng()
        const maxCount = 1 // 16 * Math.round(Math.exp(10))
        const rawVal = spawnDistributionLaw?.eval(asVect3(pos))
        const finalVal = rawVal ? (16 * Math.round(Math.exp((1 - rawVal) * 10))) / maxCount : 0
        const hasSpawned = rand * finalVal < spawnProbabilityThreshold
        const index = hasSpawned ? Math.round(rand * SPAWN_INDEX_RANGE * 10) : null
        return index
    }

    /**
     *
     * @param initialInput
     * @param maxSearchRadius to limit or to query only inner elements, use radius 0
     * @returns
     */
    queryMapArea(initialInput: Vector2[] | Box2) {
        const { discreteDistributionMap } = this
        const spawnSlotsIndex = discreteDistributionMap.queryMapSpawnSlots(initialInput)
        const confirmedSpawnSlots: Record<number, MapSpawnedElement[]> = {}
        for (const [spawnSize, spawnSlots] of Object.entries(spawnSlotsIndex)) {
            confirmedSpawnSlots[parseInt(spawnSize)] = spawnSlots
                .map(pos => {
                    const randomIndex = this.evalSpawnability(pos)
                    if (randomIndex !== null) {
                        const spawnedElement: MapSpawnedElement = {
                            pos,
                            randomIndex,
                        }
                        return spawnedElement
                    }
                    return null
                })
                .filter(val => val) as MapSpawnedElement[]
        }

        // consolex.log(`spawnable: ${spawnable.length} => spawned: ${spawned.length}`)
        // const itemsCount = spawnableItems.length
        // const itemKey = spawnableItems[itemIndex % itemsCount] as ItemType
        // const groundPatch = new GroundPatch(searchedArea)
        // groundPatch.prepare(biomes)
        // take approximative item dimension until item type is known
        // const spawnedItems: Record<ItemType, Vector3[]> = {}
        // for (const pos of spawnPlaces) {
        //   // console.log(pos)
        //   const { level, biome, landId } =
        //     groundPatch.computeGroundBlock(asVect3(pos), { heightmap, biomes })
        //   // const blockProcessor = new BlockProcessor(asVect3(pos), groundPatch)
        //   // const floorBlock = blockProcessor.getFloorBlock()
        //   const { floraItems: spawnableItems } = biomes.getBiomeLandConf(biome, landId as string) || {}
        //   if (spawnableItems && spawnableItems?.length > 0) {
        //     const itemType = this.getSpawnedItem(pos, spawnableItems) as ItemType
        //     if (itemType && itemType !== VoidItemType) {
        //       spawnedItems[itemType] = spawnedItems[itemType] || []
        //       spawnedItems[itemType]?.push(asVect3(pos, level))
        //     }
        //   }
        // }
        return confirmedSpawnSlots
    }

    // getDistributionLayer(layerType: DistributionProfile) {
    //   return this.layers[layerType]
    // }
}
