import { Vector2, Vector3 } from 'three'

import { BlockType } from '../procgen/Biome'
import { ProcItemConf } from '../tools/ProceduralGenerators'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader'
import { BiomesRawConf, BlockMode } from '../utils/types'

import { ItemType } from './ItemsInventory'
// import { NoiseSamplerParams } from '../procgen/NoiseSampler'
// import { ProcLayerParams } from '../procgen/ProcLayer'

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

  patchPowSize = 6 // as a power of two
  get patchSize() {
    return Math.pow(2, this.patchPowSize)
  }

  // max cache radius as a power of two
  cachePowLimit = 2 // 4 => 16 patches radius
  get cacheLimit() {
    return Math.pow(2, this.cachePowLimit)
  }

  get patchDimensions() {
    return new Vector2(this.patchSize, this.patchSize)
  }

  get chunkDimensions() {
    return new Vector3(this.patchSize, this.patchSize, this.patchSize)
  }

  defaultDistMapPeriod = 4 * this.patchSize

  get nearViewDist() {
    return this.patchViewDist.near * this.patchSize
  }

  get farViewDist() {
    return this.patchViewDist.far * this.patchSize
  }

  // in patch unit
  patchViewDist = {
    near: 4, // undeground view dist
    far: 8, // ground surface view dist
  }

  settings = {
    useBiomeBilinearInterpolation: true,
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

  biomes: {
    rawConf: BiomesRawConf
    seaLevel: number
  } = {
    rawConf: {} as any,
    seaLevel: 0,
  }

  get seaLevel() {
    return this.biomes.seaLevel
  }

  set seaLevel(seaLevel: number) {
    this.biomes.seaLevel = seaLevel
  }

  // heightmap: {
  //   proclayer: Partial<ProcLayerParams>,
  //   sampling: Partial<NoiseSamplerParams>,
  //   amplitude: {
  //     sampling: Partial<NoiseSamplerParams>
  //   }
  // } = {
  //     proclayer: {},
  //     sampling: {},
  //     amplitude: {
  //       sampling: {}
  //     }
  //   }
}
