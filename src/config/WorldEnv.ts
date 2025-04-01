import { Vector2, Vector3 } from 'three'

import { ProcItemConf } from '../tools/ProceduralGenerators.js'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader.js'
import { BiomesRawConf, BlockType, ItemType } from '../utils/common_types.js'
import { DistributionParams } from '../procgen/DiscreteDistributionMap.js'
import { ItemSize } from '../factory/ItemsFactory.js'

export enum WorldSeed {
  Global = 'global',
  Heightmap = 'heightmap',
  Amplitude = 'amplitude',
  Heatmap = 'heatmap',
  Rainmap = 'rainmap',
  RandomPos = 'random_pos',
  Spawn = 'spawn',
  Density = 'density',
  Sprite = 'sprite',
}

const WORLD_FALLBACK_SEED = 'world_seed'
// const WORLD_DEFAULT_SEED = 'world_seed'

export type WorldSeeds = Partial<Record<WorldSeed, string>>

export type ChunksVerticalRange = {
  bottomId: number
  topId: number
}

export type PatchViewRanges = {
  near: number // undeground view dist
  far: number // ground surface view dist
}

export type BiomesEnvSettings = {
  rawConf: BiomesRawConf
  seaLevel: number
  periodicity: number
  repartition: {
    centralHalfSegment: number
    transitionHalfRange: number
  }
}

export type HeightmapEnvSettings = {
  spreading: number
  harmonics: number
  seed?: string
}

export type DebugEnvSettings = {
  patch: {
    borderHighlightColor: BlockType
  }
  board: {
    startPosHighlightColor: BlockType
    splitSidesColoring: boolean
  }
  schematics: {
    missingBlockType: BlockType
  }
}

export type ItemsEnv = {
  schematics: {
    globalBlocksMapping: SchematicsBlocksMapping
    localBlocksMapping: Record<ItemType, SchematicsBlocksMapping>
    filesIndex: Record<ItemType, string>
  }
  proceduralConfigs: Record<ItemType, ProcItemConf>
}

type DistributionProfileParams = DistributionParams & {
  maxElementSize: number
}

type DistributionProfiles = Record<ItemSize, DistributionProfileParams>

const populateDistributionProfiles = () => {
  const distributionProfiles: DistributionProfiles = {
    [ItemSize.SMALL]: {
      maxDistance: 100,
      tries: 20,
      minDistance: 4,
      maxElementSize: 8
    },
    [ItemSize.MEDIUM]: {
      maxDistance: 100,
      tries: 20,
      minDistance: 8,
      maxElementSize: 16
    },
    [ItemSize.LARGE]: {
      maxDistance: 100,
      tries: 20,
      minDistance: 16,
      maxElementSize: 32
    }
  }
  return distributionProfiles
}


export const getWorldSeed = (worldSeeds: WorldSeeds, seedName: WorldSeed) => {
  const seed = worldSeeds[seedName] || worldSeeds[WorldSeed.Global] || WORLD_FALLBACK_SEED
  // console.log(`${seedName}: ${seed}`)
  return seed
}
export type WorldLocalSettings = {
  seeds: WorldSeeds

  distribution: {
    mapPatchRange: number
    profiles: DistributionProfiles
  }

  chunks: {
    powSize: number // as a power of two
    verticalRange: ChunksVerticalRange
  }

  items: ItemsEnv

  heightmap: HeightmapEnvSettings

  biomes: BiomesEnvSettings

  boards: {
    radius: number
    thickness: number
  }

  // cache: {
  //   patchCountRadius: number, // max cache radius in patch units, 
  // },

  debug: DebugEnvSettings
}

export class WorldLocals {
  // export const getWorldEnv = () => {
  rawSettings: WorldLocalSettings = {
    seeds: {
      [WorldSeed.Global]: WORLD_FALLBACK_SEED,
    },

    distribution: {
      mapPatchRange: 4, // extent of distribution map repeated pattern in patch units
      profiles: populateDistributionProfiles()
    },

    chunks: {
      powSize: 6,
      // idRange
      verticalRange: {
        bottomId: 0,
        topId: 5,
      },
    },

    items: {
      schematics: {
        globalBlocksMapping: {} as SchematicsBlocksMapping,
        localBlocksMapping: {} as Record<ItemType, SchematicsBlocksMapping>,
        filesIndex: {} as Record<ItemType, string>,
      },
      proceduralConfigs: {} as Record<ItemType, ProcItemConf>,
    },

    heightmap: {
      spreading: 0.42,
      harmonics: 6,
    },

    biomes: {
      rawConf: {} as BiomesRawConf,
      seaLevel: 0,
      periodicity: 8,
      repartition: {
        centralHalfSegment: 0.07, // half range of central segment in proportion to first and last symetrical segments
        transitionHalfRange: 0.05, // bilinear interpolation: 0 = no transition, 0.05 = max transition
      },
    },

    boards: {
      radius: 16,
      thickness: 3,
    },

    // cache: {
    //   patchCountRadius: 16, // 4 => 16 patches radius
    // },

    debug: {
      patch: {
        borderHighlightColor: BlockType.NONE,
      },
      board: {
        startPosHighlightColor: BlockType.NONE,
        splitSidesColoring: false,
      },
      schematics: {
        missingBlockType: BlockType.NONE,
      },
    },
  }
  // Shortcuts for modules' environment access
  get biomeEnv() {
    return this.rawSettings.biomes
  }
  get heightmapEnv() {
    return this.rawSettings.heightmap
  }
  get boardEnv() {
    return this.rawSettings.boards
  }
  get itemsEnv() {
    return this.rawSettings.items
  }
  get debugEnv() {
    return this.rawSettings.debug
  }

  // Helpers/utils
  getPatchSize = () => Math.pow(2, this.rawSettings.chunks.powSize)
  getPatchDimensions = () =>
    new Vector2(this.getPatchSize(), this.getPatchSize())

  getChunkDimensions = () =>
    new Vector3(this.getPatchSize(), this.getPatchSize(), this.getPatchSize())

  getChunksVerticalRange = () => this.rawSettings.chunks.verticalRange

  getSeaLevel = () => this.rawSettings.biomes.seaLevel
  setSeaLevel = (seaLevel: number) =>
    (this.rawSettings.biomes.seaLevel = seaLevel)

  getDistributionMapDimensions = () =>
    new Vector2(1, 1).multiplyScalar(
      this.rawSettings.distribution.mapPatchRange * this.getPatchSize(),
    )

  getDistributionProfile = (type: ItemSize) => {
    return this.rawSettings.distribution.profiles[type]
  }

  getSeed = (seedName: WorldSeed) =>
    getWorldSeed(this.rawSettings.seeds, seedName)

  // Export/import
  fromStub = (envStub: Partial<WorldLocalSettings>) => {
    Object.assign(this.rawSettings, envStub)
    return this
    // overrideSeeds(this.rawSettings.seeds.overrides)
  }

  toStub() {
    return this.rawSettings
    //   const { seeds, patchPowSize, cachePowLimit, defaultDistMapPeriod, patchViewCount, debug,
    //     chunks, schematics, proceduralItems, workerPool, boardSettings, heightmap, biomes } = this
    //   const envStub = {
    //     seeds, patchPowSize, cachePowLimit, defaultDistMapPeriod, patchViewCount, debug,
    //     chunks, schematics, proceduralItems, workerPool, boardSettings, heightmap, biomes
    //   }
    //   return envStub
  }

  // return {
  //   rawSettings,
  //   getPatchSize,
  //   getCacheLimit,
  //   getPatchDimensions,
  //   getChunkDimensions,
  //   getNearViewDist,
  //   getFarViewDist,
  //   getSeaLevel,
  //   setSeaLevel,
  //   getDistributionMapPeriod,
  //   fromStub
  // }
}
