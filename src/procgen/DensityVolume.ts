import { Vector3 } from 'three'

import { BlockType } from './Biome'
import { NoiseDimension, NoiseSampler } from './NoiseSampler'

export class DensityVolume {
  // eslint-disable-next-line no-use-before-define
  static singleton: DensityVolume
  parent: any
  params = {
    spreading: 0,
    scaling: 0.1,
  }

  // maps (externally provided)
  densityNoise!: NoiseSampler

  constructor() {
    this.densityNoise = new NoiseSampler('Caverns', NoiseDimension.Three)
    this.densityNoise.periodicity = 6
    this.densityNoise.harmonicsCount = 6
  }

  static get instance() {
    DensityVolume.singleton = DensityVolume.singleton || new DensityVolume()
    return DensityVolume.singleton
  }

  getDensity(blockPos: Vector3) {
    const { scaling } = this.params
    const { x, y, z } = blockPos.clone().multiplyScalar(scaling)
    return this.densityNoise.eval(x * scaling, y * scaling, z * scaling)
  }

  /**
   *
   * @param blockData
   * @param includeSea
   * @returns
   */
  getBlockType(
    blockPos: Vector3,
    // includeSea?: boolean,
  ) {
    const density = this.getDensity(blockPos)
    return density > 0.3 ? BlockType.TRUNK : BlockType.NONE
  }
}
