// import { SCHEMATICS_FILES_INDEX } from '../assets/schematics/index'
import { WorldEnv } from '../../index'
import { initWorldDevTools } from '../../tools/DevTools'
import { WorldIndividualSeeds } from '../WorldEnv'

import { BIOMES_LANDSCAPES_CONFIG } from './configs/biome_landscapes'
import { PROC_ITEMS_CONFIG } from './configs/procedural_items'
import {
  BLOCKS_COLOR_MAPPING,
  // ExtBlock,
  // ExtBlock,
  SCHEMATICS_BLOCKS_MAPPING,
} from './configs/blocks_mappings'

const restoreOriginalSeeds = (individualSeeds: WorldIndividualSeeds) => {
  individualSeeds.heightmap = 'heightmap'
  individualSeeds.amplitude = 'amplitude_mod'
  individualSeeds.heatmap = 'heatmap'
  individualSeeds.rainmap = 'rainmap'
  individualSeeds.density = 'Caverns'
}

export const WorldSharedSetup = (world_env = WorldEnv.current) => {
  world_env.seeds.main = 'test' // common seed use everywhere
  // world_env.seaLevel = SEA_LEVEL // TODO: remove hardcoded sea
  // world_env.chunks.dataEncoder = chunk_data_encoder
  // world_env.chunks.dataDecoder = val => voxelmapDataPacking.getMaterialId(val)
  // world_env.patchViewCount.near = 4 // chunks view below ground surface

  // EXTERNAL CONFIGS/RESOURCES
  world_env.biomes.rawConf = BIOMES_LANDSCAPES_CONFIG
  world_env.schematics.globalBlocksMapping = SCHEMATICS_BLOCKS_MAPPING
  // world_env.schematics.filesIndex = SCHEMATICS_FILES

  // WORKER POOL
  // world_env.workerPool.url = WORLD_WORKER_URL
  // world_env.workerPool.count = WORLD_WORKER_COUNT

  // BOARDS conf
  world_env.boardSettings.boardRadius = 15
  world_env.boardSettings.boardThickness = 3

  // BIOME tuning
  world_env.biomes.periodicity = 8 // biome size
  world_env.biomes.bilinearInterpolationRange = 0.1

  // DEV ONLY: LEAVE COMMENTED!
  EnvOverride(world_env)
}

/**
 * @param worldEnv provide it to setup worker's own env or it will default to main thread env
 */
export const EnvOverride = (worldEnv = WorldEnv.current) => {
  worldEnv.biomes.rawConf = BIOMES_LANDSCAPES_CONFIG
  // populate inventory with schematics and procedural objects
  worldEnv.schematics.globalBlocksMapping = {
    ...worldEnv.schematics.globalBlocksMapping,
    ...SCHEMATICS_BLOCKS_MAPPING,
  }
  // override schematics blocks mapping here
  // worldEnv.schematics.localBlocksMapping['trees/palmtree_big_1'] = {
  //   jungle_leaves: BlockType.SNOW,
  //   jungle_wood: BlockType.SAND,
  //  }
  worldEnv.proceduralItems.configs = PROC_ITEMS_CONFIG
  // worldEnv.schematics.filesIndex = SCHEMATICS_FILES_INDEX
  // worldEnv.chunks.dataEncoder = chunk_data_encoder

  // DEBUG: uncomment following lines to enable debugging feats
  // WorldEnv.current.debug.patch.borderHighlightColor = ExtBlock.DBG_LIGHT
  // WorldEnv.current.debug.schematics.missingBlockType = ExtBlock.DBG_DARK

  // restore original seeds
  restoreOriginalSeeds(WorldEnv.current.seeds.overrides)
  // worldEnv.seeds.main = undefined

  initWorldDevTools()
}

export const BlocksColorOverride = (
  blocksColorMapping: Record<number, number>,
) => ({ ...blocksColorMapping, ...BLOCKS_COLOR_MAPPING })

/**
 * Unified world setup to ensure having same settings everywhere (workers, main thread)
 */
// export class WorldConfOverride extends WorldEnv { }
