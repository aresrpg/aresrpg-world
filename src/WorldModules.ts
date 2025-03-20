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
  worldLocalEnv: WorldLocals
  biome: Biome
  heightmap: Heightmap
  densityVolume: DensityVolume
  itemsInventory: ItemsInventory
  taskHandlers: TaskHandlers
}

type ProcessingTaskHandlerId = string

export type TaskHandlers = Record<
  ProcessingTaskHandlerId,
  GenericTaskHandler
>

export const createWorldModules = (worldLocalSettings: WorldLocalSettings) => {
  const worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
  const worldSeeds = worldLocalEnv.rawSettings.seeds
  const biome = new Biome(worldLocalEnv.getBiomeEnv(), worldSeeds)
  const heightmap = new Heightmap(
    biome,
    worldLocalEnv.getHeightmapEnv(),
    worldSeeds,
  )
  const densityVolume = new DensityVolume(worldSeeds)
  const itemsInventory = new ItemsInventory(worldLocalEnv.getItemsEnv())
  // console.log('world modules initialized')
  const worldModules: WorldModules = {
    heightmap,
    biome,
    densityVolume,
    itemsInventory,
    worldLocalEnv: new WorldLocals,
    taskHandlers: {}
  }
  populateTaskHandlers(worldModules)
  return worldModules
}

// export type TaskHandlerResolver = (handlerId: ProcessingTaskHandlerId) => GenericTaskHandler | undefined

const populateTaskHandlers = (worldModules: WorldModules) => {
  const {taskHandlers}=worldModules

  taskHandlers[chunksProcessingHandlerName] = createChunksTaskHandler(worldModules)
  taskHandlers[itemsProcessingHandlerName] = createItemsTaskHandler(worldModules)
  taskHandlers[blocksProcessingHandlerName] = createBlocksTaskHandler(worldModules)

  // const getTaskHandler = (handlerId: ProcessingTaskHandlerId) => {
  //   const taskHandler = taskHandlers[handlerId]
  //   if (!taskHandler) {
  //     console.warn(`no task handler registered for ${handlerId}`)
  //   }
  //   return taskHandler
  // }

  // return getTaskHandler as TaskHandlerResolver
}
