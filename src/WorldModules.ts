import { WorldLocals, WorldLocalSettings } from './config/WorldEnv.js'
import { ItemsInventory } from './factory/ItemsFactory.js'
import { blocksProcessingHandlerName, createBlocksTaskHandler } from './processing/BlocksProcessing.js'
import { chunksProcessingHandlerName, createChunksTaskHandler } from './processing/ChunksProcessing.js'
import { createItemsTaskHandler, itemsProcessingHandlerName } from './processing/ItemsProcessing.js'
import { GenericTaskHandler } from './processing/TaskProcessing.js'
import { Biome } from './procgen/Biome.js'
import { DensityVolume } from './procgen/DensityVolume.js'
import { Heightmap } from './procgen/Heightmap.js'

/**
 * All world modules required to compute world objects
 */

export type WorldModules = {
  biome: Biome
  heightmap: Heightmap
  densityVolume: DensityVolume
  itemsInventory: ItemsInventory
}

type ProcessingTaskHandlerId = string

export type TaskHandlers = Record<
  ProcessingTaskHandlerId,
  GenericTaskHandler
>

export type WorldProcessingEnvironment = {
  worldLocalEnv: WorldLocals,
  worldModules: WorldModules,
  taskHandlers: TaskHandlers
}

export const createWorldModules = (worldLocalEnv: WorldLocals) => {
  const worldSeeds = worldLocalEnv.rawSettings.seeds
  const biome = new Biome(worldLocalEnv.getBiomeEnv(), worldSeeds)
  const heightmap = new Heightmap(
    biome,
    worldLocalEnv.getHeightmapEnv(),
    worldSeeds,
  )
  const densityVolume = new DensityVolume(worldSeeds)
  const itemsInventory = new ItemsInventory(worldLocalEnv.getItemsEnv())
  console.log('world modules initialized')
  const worldModules: WorldModules = {
    heightmap,
    biome,
    densityVolume,
    itemsInventory
  }
  return worldModules
}

// export type TaskHandlerResolver = (handlerId: ProcessingTaskHandlerId) => GenericTaskHandler | undefined

const initTaskHandlers = (worldProcEnv: WorldProcessingEnvironment) => {
  const { taskHandlers } = worldProcEnv
  taskHandlers[chunksProcessingHandlerName] = createChunksTaskHandler(worldProcEnv)
  taskHandlers[itemsProcessingHandlerName] = createItemsTaskHandler(worldProcEnv)
  taskHandlers[blocksProcessingHandlerName] = createBlocksTaskHandler(worldProcEnv)

  // const getTaskHandler = (handlerId: ProcessingTaskHandlerId) => {
  //   const taskHandler = taskHandlers[handlerId]
  //   if (!taskHandler) {
  //     console.warn(`no task handler registered for ${handlerId}`)
  //   }
  //   return taskHandler
  // }

  // return getTaskHandler as TaskHandlerResolver
  return taskHandlers
}

export const createWorldProcessingEnv = (worldLocalSettings: WorldLocalSettings) => {
  const worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
  const worldModules = createWorldModules(worldLocalEnv)
  const taskHandlers = {}
  const worldProcEnv: WorldProcessingEnvironment = {
    worldLocalEnv,
    worldModules,
    taskHandlers
  }
  initTaskHandlers(worldProcEnv)
  return worldProcEnv
}
