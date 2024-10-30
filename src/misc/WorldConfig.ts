import { Vector2, Vector3 } from 'three'
import { PatchId } from '../utils/types'
import { asVect3 } from '../utils/common'

import { BlockType } from '../procgen/Biome'

export class WorldConf {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldConf
  static get instance() {
    this.singleton = this.singleton || new WorldConf()
    return this.singleton
  }

  constructor(){

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

  get regularPatchDimensions() {
    return new Vector2(this.patchSize, this.patchSize)
  }

  get defaultChunkDimensions() {
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
    verticalRange: {
      ymin: 0,
      ymax: 5,
    }
  }
}
