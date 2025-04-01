import { WorldLocals, WorldSeed } from "../config/WorldEnv.js"
import { Box2, Vector2 } from "three"
import { asVect3 } from "../utils/patch_chunk.js"
import { NoiseSampler } from "./NoiseSampler.js"
import Alea from "../third-party/alea.js"
import { DiscreteDistributionMap, DistributionMapElement } from "./DiscreteDistributionMap.js"
import { Biome } from "./Biome.js"
import { Heightmap } from "./Heightmap.js"
import { ItemSize } from "../factory/ItemsFactory.js"

const SPAWN_INDEX_RANGE = 100

export type SpawnedElement = DistributionMapElement & {
  randomIndex: number
}

/**
 * Support multiple size items ranging from 8 to 64 blocks
 */
// SpawnDistributionMap
export class ItemsDistribution {
  itemsRadiusPowRange = {
    min: 3, // 8 blocks
    max: 3  // 5 => 32 blocks
  }
  // layers: Record<DistributionProfile, DistributionMap>
  discreteDistributionMap: DiscreteDistributionMap
  spawnDistributionLaw: NoiseSampler
  spawnProbabilityThreshold: number
  biomes: Biome
  heightmap: Heightmap

  get itemsRadiusRange() {
    const { min: powMin, max: powMax } = this.itemsRadiusPowRange
    return {
      min: Math.pow(2, powMin),
      max: Math.pow(2, powMax)
    }
  }

  constructor(worldLocalEnv: WorldLocals, heightmap: Heightmap, biomes: Biome) {
    const spawnSeed = worldLocalEnv.getSeed(WorldSeed.Spawn)
    const patternDimension = worldLocalEnv.getDistributionMapDimensions()
    const distributionProfile = worldLocalEnv.getDistributionProfile(ItemSize.MEDIUM)
    this.discreteDistributionMap = new DiscreteDistributionMap(patternDimension, distributionProfile, spawnSeed)
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

  /**
     * Searched area on the infinite map depends on the biggest item size 
     * which can overlap with intial area 
     * @param input point, patch or bounds
     * @returns area to query items' spawn positions
     */
  getSpawnSearchArea(input: Vector2 | Box2, maxSearchRadius?: number) {
    const { max: itemsMaxRadius } = this.itemsRadiusRange
    const searchRadius = maxSearchRadius && maxSearchRadius >= 0 ? Math.min(itemsMaxRadius, maxSearchRadius) : itemsMaxRadius
    if (input instanceof Box2) {
      return input.clone().expandByScalar(searchRadius)
    }
    // else if (input instanceof Vector2) {
    else {
      // build a box around local point to include neighboor patterns that could also have items overlapping with that point
      const queriedArea = new Box2().setFromCenterAndSize(
        input,
        new Vector2(searchRadius, searchRadius).multiplyScalar(2),
      )
      return queriedArea
    }
    // else {
    //   return asPatchBounds(
    //     input,
    //     worldLocalEnv.getPatchDimensions(),
    //   ).expandByScalar(itemsRadius)
    // }
  }

  evalSpawnability(pos: Vector2) {
    const { spawnProbabilityThreshold, spawnDistributionLaw } = this
    const posId = pos.x + ':' + pos.y
    const prng = Alea(posId)
    const rand = prng()
    const maxCount = 1 // 16 * Math.round(Math.exp(10))
    const rawVal = spawnDistributionLaw?.eval(asVect3(pos))
    const finalVal = rawVal
      ? (16 * Math.round(Math.exp((1 - rawVal) * 10))) / maxCount
      : 0
    const hasSpawned = rand * finalVal < spawnProbabilityThreshold
    const index = hasSpawned ? Math.round(rand * SPAWN_INDEX_RANGE * 10) : null
    return index

  }

  queryMapArea(initialInput: Vector2 | Box2, maxSearchRadius?: number) {
    const { discreteDistributionMap } = this
    const searchedArea = this.getSpawnSearchArea(initialInput, maxSearchRadius)
    const spawnable = discreteDistributionMap.queryMapElements(searchedArea)
    const spawned = spawnable.map(element => {
      const { pos, spawnableSizes } = element
      const randomIndex = this.evalSpawnability(pos)
      if (randomIndex !== null) {
        const spawnedElement: SpawnedElement = {
          pos,
          spawnableSizes,
          randomIndex
        }
        return spawnedElement
      }
      return null
    }).filter(val => val) as SpawnedElement[]
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
    return spawned
  }

  // getDistributionLayer(layerType: DistributionProfile) {
  //   return this.layers[layerType]
  // }
}