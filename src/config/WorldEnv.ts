import { Vector2, Vector3 } from 'three'

import { Biome, BlockType } from '../procgen/Biome.js'
import { DensityVolume } from '../procgen/DensityVolume.js'
import { Heightmap } from '../procgen/Heightmap.js'
import { ProcItemConf } from '../tools/ProceduralGenerators.js'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader.js'
import { BiomesRawConf, ItemType } from '../utils/common_types.js'

export type WorldIndividualSeeds = {
  heightmap?: string // 'heatmap',
  amplitude?: string // 'amplitude_mod',
  heatmap?: string // 'heatmap',
  rainmap?: string // 'rainmap',
  randompos?: string // 'pos_random',
  entityspawn?: string // 'treemap',
  density?: string // 'Caverns'
}

export type WorldEnvSettings = {
  seeds: {
    main: string
    overrides: WorldIndividualSeeds
  }

  patchPowSize: number // as a power of two
  // max cache radius as a power of two
  cachePowLimit: number // 4 => 16 patches radius
  distributionMapPeriod: number

  // in patch unit
  patchViewRanges: {
    near: number // undeground view dist
    far: number // ground surface view dist
  }

  debug: {
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

  chunks: {
    range: {
      bottomId: number
      topId: number
    }
  }

  schematics: {
    globalBlocksMapping: SchematicsBlocksMapping
    localBlocksMapping: Record<ItemType, SchematicsBlocksMapping>
    filesIndex: Record<ItemType, string>
  }

  proceduralItems: {
    configs: Record<ItemType, ProcItemConf>
  }

  boards: {
    boardRadius: number
    boardThickness: number
  }

  heightmap: {
    spreading: number
    harmonics: number
  }

  biomes: {
    rawConf: BiomesRawConf
    seaLevel: number
    periodicity: number
    bilinearInterpolationRange: number // from 0 to 0.1
  }
}

// export type WorldEnvCustomSettings = Partial<WorldEnvSettings>
// // use for having auto-complete in non-TS projects
// export const getWorldEnvCustomSettings = () => ({} as WorldEnvCustomSettings)

const overrideSeeds = (customSeeds: WorldIndividualSeeds) => {
  Heightmap.instance.heightmap.sampling.seed = customSeeds.heightmap
  Heightmap.instance.amplitude.sampling.seed = customSeeds.amplitude
  Biome.instance.heatmap.sampling.seed = customSeeds.heatmap
  Biome.instance.rainmap.sampling.seed = customSeeds.rainmap
  Biome.instance.posRandomizer.sampling.seed = customSeeds.randompos
  DensityVolume.instance.densityNoise.seed = customSeeds.density
}

export class WorldEnv {
  // export const getWorldEnv = () => {
  rawSettings: WorldEnvSettings = {
    seeds: {
      main: 'world',
      overrides: {} as WorldIndividualSeeds,
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

    chunks: {
      range: {
        bottomId: 0,
        topId: 5,
      },
    },

    schematics: {
      globalBlocksMapping: {} as SchematicsBlocksMapping,
      localBlocksMapping: {} as Record<ItemType, SchematicsBlocksMapping>,
      filesIndex: {} as Record<ItemType, string>,
    },

    proceduralItems: {
      configs: {} as Record<ItemType, ProcItemConf>,
    },

    boards: {
      boardRadius: 32,
      boardThickness: 5,
    },

    heightmap: {
      spreading: 0.42,
      harmonics: 6,
    },

    biomes: {
      rawConf: {} as BiomesRawConf,
      seaLevel: 0,
      periodicity: 8,
      bilinearInterpolationRange: 0.1, // from 0 to 0.1
    },
  }

  getPatchSize = () => Math.pow(2, this.rawSettings.patchPowSize)
  getCacheLimit = () => Math.pow(2, this.rawSettings.cachePowLimit)
  getPatchDimensions = () =>
    new Vector2(this.getPatchSize(), this.getPatchSize())

  getChunkDimensions = () =>
    new Vector3(this.getPatchSize(), this.getPatchSize(), this.getPatchSize())

  getNearViewDist = () =>
    this.rawSettings.patchViewRanges.near * this.getPatchSize()

  getFarViewDist = () =>
    this.rawSettings.patchViewRanges.far * this.getPatchSize()

  getSeaLevel = () => this.rawSettings.biomes.seaLevel
  setSeaLevel = (seaLevel: number) =>
    (this.rawSettings.biomes.seaLevel = seaLevel)

  getDistributionMapPeriod = () =>
    this.rawSettings.distributionMapPeriod * this.getPatchSize()

  fromStub = (envStub: Partial<WorldEnvSettings>) => {
    Object.assign(this.rawSettings, envStub)
    overrideSeeds(this.rawSettings.seeds.overrides)
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

export const worldRootEnv = new WorldEnv()
