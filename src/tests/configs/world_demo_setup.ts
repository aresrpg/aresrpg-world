// import { SCHEMATICS_FILES_INDEX } from '../assets/schematics/index'
// import { initWorldDevTools } from '../../tools/DevTools'
import { WorldIndividualSeeds, WorldEnv } from '../../config/WorldEnv.js'

import { BIOMES_LANDSCAPES_CONFIG } from './biome_landscapes.js'
// import { PROC_ITEMS_CONFIG } from './settings/procedural_items'
import {
  BLOCKS_COLOR_MAPPING,
  SCHEMATICS_BLOCKS_MAPPING,
} from './blocks_mappings.js'

const restoreOriginalSeeds = (individualSeeds: WorldIndividualSeeds) => {
  individualSeeds.heightmap = 'heightmap'
  individualSeeds.amplitude = 'amplitude_mod'
  individualSeeds.heatmap = 'heatmap'
  individualSeeds.rainmap = 'rainmap'
  individualSeeds.density = 'Caverns'
}

export const getWorldDemoEnv = () => {
  const worldEnv = new WorldEnv()
  const { rawSettings } = worldEnv // WorldEnv.current

  // SEEDS
  rawSettings.seeds.main = 'test' // common seed used everywhere
  restoreOriginalSeeds(rawSettings.seeds.overrides)

  // EXTERNAL CONF/RESOURCES
  rawSettings.biomes.rawConf = BIOMES_LANDSCAPES_CONFIG
  rawSettings.schematics.globalBlocksMapping = SCHEMATICS_BLOCKS_MAPPING
  // rawSettings.proceduralItems.configs = PROC_ITEMS_CONFIG
  // worldEnv.schematics.globalBlocksMapping = {
  //   ...worldEnv.schematics.globalBlocksMapping,
  //   ...SCHEMATICS_BLOCKS_MAPPING,
  // }
  // world_env.schematics.filesIndex = SCHEMATICS_FILES

  // WORKER POOL
  // world_env.workerPool.url = WORLD_WORKER_URL
  // world_env.workerPool.count = WORLD_WORKER_COUNT

  // BOARDS conf
  // rawSettings.boards.boardRadius = 15
  // rawSettings.boards.boardThickness = 3

  // BIOME tuning
  rawSettings.biomes.periodicity = 8 // biome size
  rawSettings.biomes.repartition.centralHalfSegment = 0.15
  // rawSettings.biomes.repartition.transitionHalfRange = 0.05
  rawSettings.chunks.verticalRange.topId = 6
  return worldEnv
}

export const BlocksColorOverride = (
  blocksColorMapping: Record<number, number>,
) => ({ ...blocksColorMapping, ...BLOCKS_COLOR_MAPPING })

/**
 * Unified world setup to ensure having same settings everywhere (workers, main thread)
 */
// export class WorldConfOverride extends WorldEnv { }
