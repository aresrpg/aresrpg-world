import { WorldGlobals, WorldLocals, WorldLocalSettings } from '../config/WorldEnv.js'
import { ItemsInventory } from './ItemsInventory.js'
import { BlocksTask, createBlocksTaskHandler } from '../processing/BlocksProcessing.js'
import { ChunksTask, createChunksTaskHandler } from '../processing/ChunksProcessing.js'
import { createItemsTaskHandler, ItemsTask } from '../processing/ItemsProcessing.js'
import { GenericTaskHandler, TaskHandlerId } from '../processing/TaskProcessing.js'
import { Biome } from '../procgen/Biome.js'
import { DensityVolume } from '../procgen/DensityVolume.js'
// import { DistributionLayers } from './procgen/DistributionLayers.js'
import { Heightmap } from '../procgen/Heightmap.js'
// import { NoiseSampler } from './procgen/NoiseSampler.js'
import { ItemsMapDistribution } from '../procgen/ItemsMapDistribution.js'

/**
 * All world modules required to compute world objects
 */

export type TaskHandlers = Record<TaskHandlerId, GenericTaskHandler>

export type WorldModules = {
    worldLocalEnv: WorldLocals
    // distributionLayers: DistributionLayers
    biomes: Biome
    heightmap: Heightmap
    densityVolume: DensityVolume
    itemsInventory: ItemsInventory
    itemsMapDistribution: ItemsMapDistribution
    taskHandlers: TaskHandlers
}

export const createWorldModules = async (worldLocalSettings: WorldLocalSettings) => {
    const worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
    WorldGlobals.instance.import(worldLocalEnv.globalEnv)
    const worldSeeds = worldLocalEnv.rawSettings.seeds
    const itemsInventory = new ItemsInventory(worldLocalEnv.itemsEnv)
    // this will trigger schematics preloading to avoid async afterwhile
    const parsedBiomes = await Biome.parseBiomesConf(worldLocalEnv.biomeEnv.rawConf, itemsInventory)
    const biomes = new Biome(parsedBiomes, worldLocalEnv.biomeEnv, worldSeeds)
    const heightmap = new Heightmap(biomes, worldLocalEnv.heightmapEnv, worldSeeds)
    const densityVolume = new DensityVolume(worldSeeds)
    // const distributionLayers = new DistributionLayers(worldLocalEnv)
    const itemsMapDistribution = new ItemsMapDistribution(worldLocalEnv, heightmap, biomes)
    // const spriteDistribution = new NoiseSampler(
    //   worldLocalEnv.getSeed(WorldSeed.Sprite),
    //   'sprite_distribution',
    // )
    // console.log('world modules initialized')
    const worldModules: WorldModules = {
        worldLocalEnv,
        // distributionLayers,
        heightmap,
        biomes,
        densityVolume,
        itemsInventory,
        itemsMapDistribution,
        taskHandlers: {},
    }
    populateTaskHandlers(worldModules)
    return worldModules
}

// export type TaskHandlerResolver = (handlerId: ProcessingTaskHandlerId) => GenericTaskHandler | undefined

const populateTaskHandlers = (worldModules: WorldModules) => {
    const { taskHandlers } = worldModules

    taskHandlers[ChunksTask.handlerId] = createChunksTaskHandler(worldModules)
    taskHandlers[ItemsTask.handlerId] = createItemsTaskHandler(worldModules)
    taskHandlers[BlocksTask.handlerId] = createBlocksTaskHandler(worldModules)

    // const getTaskHandler = (handlerId: ProcessingTaskHandlerId) => {
    //   const taskHandler = taskHandlers[handlerId]
    //   if (!taskHandler) {
    //     console.warn(`no task handler registered for ${handlerId}`)
    //   }
    //   return taskHandler
    // }

    // return getTaskHandler as TaskHandlerResolver
}
