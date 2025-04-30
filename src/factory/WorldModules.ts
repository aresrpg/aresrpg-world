import { getWorldSeed, WorldGlobals, WorldLocals, WorldLocalSettings, WorldSeed } from '../config/WorldEnv.js'
import { BlocksTask, createBlocksTaskHandler } from '../processing/BlocksProcessing.js'
import { ChunksTask, createChunksTaskHandler } from '../processing/ChunksProcessing.js'
import { createItemsTaskHandler, ItemsTask } from '../processing/ItemsProcessing.js'
import { GenericTaskHandler, TaskHandlerId } from '../processing/TaskProcessing.js'
import { Biome } from '../procgen/Biome.js'
import { Ground } from '../procgen/Ground.js'
import { CavernsVolumetricDensity } from '../procgen/NoiseSampler.js'
import { Spawn } from '../procgen/Spawn.js'
import { parseBiomesConf } from '../config/world-conf-parser.js'

import { SpawnInventory } from './SpawnInventory.js'

/**
 * All world modules required to compute world objects
 */

export type WorldTasksHandlers = Record<TaskHandlerId, GenericTaskHandler>

export type WorldModules = {
    worldLocalEnv: WorldLocals
    // distributionLayers: DistributionLayers
    biomes: Biome
    ground: Ground
    spawn: Spawn
    cavesDensity: CavernsVolumetricDensity
    taskHandlers: WorldTasksHandlers
}

export const createWorldModules = async (worldLocalSettings: WorldLocalSettings) => {
    const worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
    WorldGlobals.instance.import(worldLocalEnv.globalEnv)
    SpawnInventory.instance.inventoryEnv = worldLocalEnv.inventoryEnv
    const worldSeeds = worldLocalEnv.rawSettings.seeds
    // this will trigger schematics preloading to avoid async afterwhile
    const biomesConf = await parseBiomesConf(worldLocalEnv.biomeEnv.rawConf)
    const biomes = new Biome(worldLocalEnv.biomeEnv, worldSeeds)
    const ground = new Ground(biomes, biomesConf, worldLocalEnv.groundEnv, worldSeeds)
    const spawn = new Spawn(biomes, ground, worldLocalEnv.getSparseMapSize(), getWorldSeed(worldSeeds, WorldSeed.Spawn))
    const cavesDensity = new CavernsVolumetricDensity(getWorldSeed(worldSeeds, WorldSeed.Density))
    // console.log('world modules initialized')
    const worldModules: WorldModules = {
        worldLocalEnv,
        // distributionLayers,
        ground,
        biomes,
        spawn,
        cavesDensity,
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
