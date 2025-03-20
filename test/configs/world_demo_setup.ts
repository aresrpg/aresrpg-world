// import { SCHEMATICS_FILES_INDEX } from '../assets/schematics/index'
// import { initWorldDevTools } from '../../tools/DevTools'
import {
  WorldLocals,
  WorldSeed,
  WorldSeeds,
} from '../../src/config/WorldEnv.js'

import { BIOMES_LANDSCAPES_CONFIG } from './biome_landscapes.js'
// import { PROC_ITEMS_CONFIG } from './settings/procedural_items'
import {
  BLOCKS_COLOR_MAPPING,
  SCHEMATICS_BLOCKS_MAPPING,
} from './blocks_mappings.js'

const restoreOriginalSeeds = (worldSeeds: WorldSeeds) => {
  worldSeeds[WorldSeed.Heightmap] = 'heightmap'
  worldSeeds[WorldSeed.Amplitude] = 'amplitude_mod'
  worldSeeds[WorldSeed.Heatmap] = 'heatmap'
  worldSeeds[WorldSeed.Rainmap] = 'rainmap'
  worldSeeds[WorldSeed.Density] = 'Caverns'
}

export const getWorldDemoEnv = () => {
  const worldLocalEnv = new WorldLocals()
  const { rawSettings } = worldLocalEnv // WorldEnv.current

  // SEEDS
  rawSettings.seeds[WorldSeed.Global] = 'test' // common seed used everywhere
  restoreOriginalSeeds(rawSettings.seeds)

  // EXTERNAL CONF/RESOURCES
  rawSettings.biomes.rawConf = BIOMES_LANDSCAPES_CONFIG
  rawSettings.items.schematics.globalBlocksMapping = SCHEMATICS_BLOCKS_MAPPING
  // rawSettings.proceduralItems.configs = PROC_ITEMS_CONFIG
  // worldEnv.schematics.globalBlocksMapping = {
  //   ...worldEnv.schematics.globalBlocksMapping,
  //   ...SCHEMATICS_BLOCKS_MAPPING,
  // }
  // rawSettings.items.schematics.filesIndex = SCHEMATICS_FILES_INDEX

  // WORKER POOL
  // world_env.workerPool.url = WORLD_WORKER_URL
  // world_env.workerPool.count = WORLD_WORKER_COUNT

  // BOARDS conf
  // rawSettings.boards.boardRadius = 15
  // rawSettings.boards.boardThickness = 3

  // BIOME tuning
  rawSettings.biomes.periodicity = 8 // biome size
  rawSettings.biomes.repartition.centralHalfSegment = 0.15
  rawSettings.biomes.seaLevel = 76
  // rawSettings.biomes.repartition.transitionHalfRange = 0.05
  rawSettings.chunks.verticalRange.topId = 6
  return worldLocalEnv
}

export const BlocksColorOverride = (
  blocksColorMapping: Record<number, number>,
) => ({ ...blocksColorMapping, ...BLOCKS_COLOR_MAPPING })

/**
 * Unified world setup to ensure having same settings everywhere (workers, main thread)
 */
// export class WorldConfOverride extends WorldEnv { }
