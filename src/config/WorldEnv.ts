import { Vector2, Vector3 } from 'three'

import { ProcItemConf } from '../tools/ProceduralGenerators.js'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader.js'
import { BiomesRawConf, BlockType, ItemType } from '../utils/common_types.js'

export enum WorldSeed {
  Global = 'global',
  Heightmap = 'heightmap',
  Amplitude = 'amplitude',
  Heatmap = 'heatmap',
  Rainmap = 'rainmap',
  RandomPos = 'random_pos',
  Spawn = 'spawn',
  Density = 'density',
}

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

export const getWorldSeed = (worldSeeds: WorldSeeds, seedName: WorldSeed) => {
  const seed = worldSeeds[seedName] || worldSeeds[WorldSeed.Global]
  // console.log(`${seedName}: ${seed}`)
  return seed
}
export type WorldLocalSettings = {
  seeds: WorldSeeds

  patchPowSize: number // as a power of two
  // max cache radius as a power of two
  cachePowLimit: number // 4 => 16 patches radius
  distributionMapPeriod: number

  // in patch unit
  patchViewRanges: PatchViewRanges

  chunks: {
    verticalRange: ChunksVerticalRange
  }

  items: ItemsEnv

  heightmap: HeightmapEnvSettings

  biomes: BiomesEnvSettings

  boards: {
    radius: number
    thickness: number
  }
}

export class WorldLocals {
  // export const getWorldEnv = () => {
  rawSettings: WorldLocalSettings = {
    seeds: {
      [WorldSeed.Global]: 'world',
    },

    patchPowSize: 6, // as a power of two
    // max cache radius as a power of two
    cachePowLimit: 2, // 4 => 16 patches radius
    distributionMapPeriod: 4,

    // in patch unit
    patchViewRanges: {
      near: 4, // undeground view dist
      far: 8, // ground surface view dist
    },

    chunks: {
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
  }

  getBiomeEnv = () => this.rawSettings.biomes
  getHeightmapEnv = () => this.rawSettings.heightmap
  getBoardEnv = () => this.rawSettings.boards
  getItemsEnv = () => this.rawSettings.items

  getPatchSize = () => Math.pow(2, this.rawSettings.patchPowSize)
  getCacheLimit = () => Math.pow(2, this.rawSettings.cachePowLimit)
  getPatchDimensions = () =>
    new Vector2(this.getPatchSize(), this.getPatchSize())

  getChunkDimensions = () =>
    new Vector3(this.getPatchSize(), this.getPatchSize(), this.getPatchSize())

  getChunksVerticalRange = () => this.rawSettings.chunks.verticalRange

  getNearViewDist = () =>
    this.rawSettings.patchViewRanges.near * this.getPatchSize()

  getFarViewDist = () =>
    this.rawSettings.patchViewRanges.far * this.getPatchSize()

  getSeaLevel = () => this.rawSettings.biomes.seaLevel
  setSeaLevel = (seaLevel: number) =>
    (this.rawSettings.biomes.seaLevel = seaLevel)

  getDistributionMapDimensions = () =>
    new Vector2(1, 1).multiplyScalar(
      this.rawSettings.distributionMapPeriod * this.getPatchSize(),
    )

  getSeed = (seedName: WorldSeed) =>
    getWorldSeed(this.rawSettings.seeds, seedName)

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

export class WorldGlobals {
  static debug: DebugEnvSettings = {
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
  }
}
