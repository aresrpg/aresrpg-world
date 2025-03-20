

// Env
export { WorldLocals, WorldGlobals } from './config/WorldEnv.js'
export { getWorldDemoEnv } from './tests/configs/world_demo_setup.js'
// Utils
// export * as WorldUtils from './utils/index'
export {
  getPatchId,
  asVect2,
  asVect3,
  parseChunkKey,
  parseThreeStub,
} from './utils/patch_chunk.js'
export { chunksFromCompressedBlob } from './utils/chunk_utils.js'
export { BlockType, BlockMode } from './utils/common_types.js'
// Processing
export { ProcessingTask } from './processing/TaskProcessing.js'
export {
  BlocksProcessing,
  BlocksProcessingRecipe,
} from './processing/BlocksProcessing.js'
export {
  BoardProvider,
  BoardCacheProvider,
  BlockCategory,
} from './processing/BoardProvider.js'
export { ChunksPolling } from './processing/ChunksPolling.js'
export {
  PseudoDistributionMap,
  DistributionProfile,
} from './processing/RandomDistributionMap.js'
export { ProcessingState } from './processing/TaskProcessing.js'
export { WorkerPool } from './processing/WorkerPool.js'
// Procgen
export { Biome, BiomeType } from './procgen/Biome.js'
export { Heightmap } from './procgen/Heightmap.js'
export { DensityVolume } from './procgen/DensityVolume.js'
// Data structures
export { ChunkContainer } from './datacontainers/ChunkContainer.js'
// Factory
// export { ItemsInventory } from './factory/ItemsFactory.js'
export { GroundChunk, EmptyChunk, CavesMask } from './factory/ChunksFactory.js'
// Tools
export { SchematicLoader } from './tools/SchematicLoader.js'
export {
  ProceduralItemGenerator,
  ProcItemType,
  ProcItemCategory,
} from './tools/ProceduralGenerators.js'
// export * as ProceduralGenerators from './tools/ProceduralGenerators'
// Services
export { chunksWsClient } from './remote-services/chunks_over_ws_client.js'
// export { initWebWorker } from './processing/world_compute_worker.js'
export { createWorldModules, type WorldModules } from './WorldModules.js'

