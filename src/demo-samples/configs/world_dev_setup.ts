// import { SCHEMATICS_FILES_INDEX } from '../assets/schematics/index'
import { WorldEnv } from '../../index'

import { BIOMES_LANDSCAPES_CONFIG } from './biome_landscapes'
import { PROC_ITEMS_CONFIG } from './procedural_items'
import {
  BLOCKS_COLOR_MAPPING,
  SCHEMATICS_BLOCKS_MAPPING,
} from './blocks_mappings'

/**
 * @param worldEnv provide it to setup worker's own env or it will default to main thread env
 */
export const EnvOverride = (worldEnv = WorldEnv.current) => {
  worldEnv.biomes.rawConf = BIOMES_LANDSCAPES_CONFIG
  // populate inventory with schematics and procedural objects
  worldEnv.schematics.blocksMapping = SCHEMATICS_BLOCKS_MAPPING
  worldEnv.proceduralItems.configs = PROC_ITEMS_CONFIG
  // worldEnv.schematics.filesIndex = SCHEMATICS_FILES_INDEX
  // worldEnv.chunks.dataEncoder = chunk_data_encoder

  // DEBUG: uncomment following lines to enable debugging feats
  // WorldEnv.debug.patch.borderHighlightColor = block_type.DBG_LIGHT
  // WorldEnv.debug.schematics.missingBlockType = block_type.DBG_DARK
}

export const BlocksColorMapping = BLOCKS_COLOR_MAPPING

/**
 * Unified world setup to ensure having same settings everywhere (workers, main thread)
 */
export class WorldConfOverride extends WorldEnv {}
