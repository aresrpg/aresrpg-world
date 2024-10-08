import { Vector2 } from 'three'

import { BlockType } from '../index'

export class WorldConf {
  static patchPowSize = 6 // as a power of two
  static get patchSize() {
    return Math.pow(2, this.patchPowSize)
  }

  // max cache radius as a power of two
  static cachePowLimit = 2 // 4 => 16 patches radius
  static get cacheLimit() {
    return Math.pow(2, this.cachePowLimit)
  }

  static get regularPatchDimensions() {
    return new Vector2(this.patchSize, this.patchSize)
  }

  static defaultDistMapPeriod = 4 * WorldConf.patchSize
  static debug = {
    patch: {
      borderHighlightColor: BlockType.NONE,
    },
    board: {
      startPosHighlightColor: BlockType.NONE,
      splitSidesColoring: false,
    },
  }
}
