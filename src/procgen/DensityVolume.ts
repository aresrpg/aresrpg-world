import { Vector3 } from 'three'

import { NoiseDimension, NoiseSampler } from './NoiseSampler.js'

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
    this.densityNoise.periodicity = 7
    this.densityNoise.harmonicsCount = 4
  }

  static get instance() {
    DensityVolume.singleton = DensityVolume.singleton || new DensityVolume()
    return DensityVolume.singleton
  }

  /**
   *
   * @param blockData
   * @param includeSea
   * @returns
   */
  getBlockDensity(
    blockPos: Vector3,
    groundLevel = 512,
    // includeSea?: boolean,
  ) {
    const { scaling } = this.params
    const { x, y, z } = blockPos.clone().multiplyScalar(scaling)
    const density = this.densityNoise.eval(
      x * scaling,
      y * scaling,
      z * scaling,
    )
    // adaptative density threshold based on terrain height
    const threshold = Math.sin((blockPos.y / groundLevel) * Math.PI) * 0.5
    return density < threshold
  }
}
