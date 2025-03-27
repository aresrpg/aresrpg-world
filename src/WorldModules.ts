import { WorldLocals, WorldLocalSettings } from './config/WorldEnv.js'
import { ItemsInventory } from './factory/ItemsFactory.js'
import {
  BlocksTask,
  createBlocksTaskHandler,
} from './processing/BlocksProcessing.js'
import {
  ChunksTask,
  createChunksTaskHandler,
} from './processing/ChunksProcessing.js'
import {
  createItemsTaskHandler,
  ItemsTask,
} from './processing/ItemsProcessing.js'
import {
  GenericTaskHandler,
  ProcessingContext,
  ProcessingTaskHandlerId,
} from './processing/TaskProcessing.js'
import { Biome } from './procgen/Biome.js'
import { DensityVolume } from './procgen/DensityVolume.js'
import { Heightmap } from './procgen/Heightmap.js'

/**
 * All world modules required to compute world objects
 */

export type TaskHandlers = Record<ProcessingTaskHandlerId, GenericTaskHandler>

export type WorldModules = {
  worldLocalEnv: WorldLocals
  biome: Biome
  heightmap: Heightmap
  densityVolume: DensityVolume
  itemsInventory: ItemsInventory
  taskHandlers: TaskHandlers
}

export const createWorldModules = (
  worldLocalSettings: WorldLocalSettings,
  processingContext = ProcessingContext.None,
) => {
  const worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
  const worldSeeds = worldLocalEnv.rawSettings.seeds
  const biome = new Biome(worldLocalEnv.biomeEnv, worldSeeds)
  const heightmap = new Heightmap(
    biome,
    worldLocalEnv.heightmapEnv,
    worldSeeds,
  )
  const densityVolume = new DensityVolume(worldSeeds)
  const itemsInventory = new ItemsInventory(worldLocalEnv.itemsEnv)
  // console.log('world modules initialized')
  const worldModules: WorldModules = {
    heightmap,
    biome,
    densityVolume,
    itemsInventory,
    worldLocalEnv: worldLocalEnv,
    taskHandlers: {},
  }
  populateTaskHandlers(worldModules, processingContext)
  return worldModules
}

// export type TaskHandlerResolver = (handlerId: ProcessingTaskHandlerId) => GenericTaskHandler | undefined

const populateTaskHandlers = (
  worldModules: WorldModules,
  processingContext: ProcessingContext,
) => {
  const { taskHandlers } = worldModules

  taskHandlers[ChunksTask.handlerId] = createChunksTaskHandler(worldModules)
  taskHandlers[ItemsTask.handlerId] = createItemsTaskHandler(worldModules)
  taskHandlers[BlocksTask.handlerId] = createBlocksTaskHandler(
    worldModules,
    processingContext,
  )

  // const getTaskHandler = (handlerId: ProcessingTaskHandlerId) => {
  //   const taskHandler = taskHandlers[handlerId]
  //   if (!taskHandler) {
  //     console.warn(`no task handler registered for ${handlerId}`)
  //   }
  //   return taskHandler
  // }

  // return getTaskHandler as TaskHandlerResolver
}
