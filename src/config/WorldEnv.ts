import { Vector2, Vector3 } from 'three'

import { ItemType } from '../factory/ItemsFactory.js'
import { DensityVolume, Heightmap } from '../index.js'
import { Biome, BlockType } from '../procgen/Biome.js'
import { ProcItemConf } from '../tools/ProceduralGenerators.js'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader.js'
import { BiomesRawConf, BlockMode } from '../utils/common_types.js'

export type WorldIndividualSeeds = {
  heightmap?: string // 'heatmap',
  amplitude?: string // 'amplitude_mod',
  heatmap?: string // 'heatmap',
  rainmap?: string // 'rainmap',
  randompos?: string // 'pos_random',
  entityspawn?: string // 'treemap',
  density?: string // 'Caverns'
}

export class WorldEnv {
  // eslint-disable-next-line no-use-before-define
  static currentConf: WorldEnv
  static get current() {
    this.currentConf = this.currentConf || new WorldEnv()
    return this.currentConf
  }

  static set current(externalConf: WorldEnv) {
    this.currentConf = externalConf
  }

  apply() {
    this.overrideSeeds()
  }

  overrideSeeds() {
    const customSeeds = this.seeds.overrides
    Heightmap.instance.heightmap.sampling.seed = customSeeds.heightmap
    Heightmap.instance.amplitude.sampling.seed = customSeeds.amplitude
    Biome.instance.heatmap.sampling.seed = customSeeds.heatmap
    Biome.instance.rainmap.sampling.seed = customSeeds.rainmap
    Biome.instance.posRandomizer.sampling.seed = customSeeds.randompos
    DensityVolume.instance.densityNoise.seed = customSeeds.density
  }

  seeds: {
    main: string
    overrides: WorldIndividualSeeds
  } = {
    main: 'world',
    overrides: {},
  }

  patchPowSize = 6 // as a power of two
  // max cache radius as a power of two
  cachePowLimit = 2 // 4 => 16 patches radius
  defaultDistMapPeriod = 4 * this.patchSize

  // in patch unit
  patchViewCount = {
    near: 4, // undeground view dist
    far: 8, // ground surface view dist
  }

  debug = {
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

  chunks = {
    range: {
      bottomId: 0,
      topId: 5,
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dataEncoder: (blockType: BlockType, _blockMode?: BlockMode) =>
      blockType || BlockType.NONE,
    dataDecoder: (rawData: number) => rawData || BlockType.NONE,
  }

  schematics: {
    globalBlocksMapping: SchematicsBlocksMapping
    localBlocksMapping: Record<ItemType, SchematicsBlocksMapping>
    filesIndex: Record<ItemType, string>
  } = {
    globalBlocksMapping: {},
    localBlocksMapping: {},
    filesIndex: {},
  }

  proceduralItems: {
    configs: Record<ItemType, ProcItemConf>
  } = {
    configs: {},
  }

  workerPool = {
    count: 4,
    url: '', // if undef will default to main thread
    type: undefined,
  }

  boardSettings = {
    boardRadius: 32,
    boardThickness: 5,
  }

  heightmap = {
    spreading: 0.42,
    harmonics: 6,
  }

  biomes = {
    rawConf: {} as BiomesRawConf,
    seaLevel: 0,
    periodicity: 8,
    bilinearInterpolationRange: 0.1, // from 0 to 0.1
  }

  get patchSize() {
    return Math.pow(2, this.patchPowSize)
  }

  get cacheLimit() {
    return Math.pow(2, this.cachePowLimit)
  }

  get patchDimensions() {
    return new Vector2(this.patchSize, this.patchSize)
  }

  get chunkDimensions() {
    return new Vector3(this.patchSize, this.patchSize, this.patchSize)
  }

  get nearViewDist() {
    return this.patchViewCount.near * this.patchSize
  }

  get farViewDist() {
    return this.patchViewCount.far * this.patchSize
  }

  get seaLevel() {
    return this.biomes.seaLevel
  }

  set seaLevel(seaLevel: number) {
    this.biomes.seaLevel = seaLevel
  }
}
