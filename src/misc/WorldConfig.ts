import { Vector2, Vector3 } from 'three'
import { BlockType } from '../procgen/Biome'

export class WorldConf {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldConf
  static get instance() {
    this.singleton = this.singleton || new WorldConf()
    return this.singleton
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

  chunkSettings = {
    genRange: {
      yMinId: 0,
      yMaxId: 5,
    }
  }

  workerPool = {
    count: 4,
    url: '', // if undef will default to main thread
    type: undefined
  }

  boardSettings = {
    boardRadius: 32,
    boardThickness: 5
  }
}
