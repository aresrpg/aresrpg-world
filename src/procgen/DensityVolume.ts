import { Vector3 } from 'three'

import { getWorldSeed, WorldSeed, WorldSeeds } from '../config/WorldEnv.js'

import { NoiseDimension, NoiseSampler } from './NoiseSampler.js'

export class DensityVolume {
  parent: any
  params = {
    spreading: 0,
    scaling: 0.1,
  }

  densityNoise: NoiseSampler

  constructor(worldSeeds: WorldSeeds) {
    const densitySeed = getWorldSeed(worldSeeds, WorldSeed.Density)
    this.densityNoise = new NoiseSampler(
      densitySeed,
      'densityVolume',
      NoiseDimension.Three,
    )
    this.densityNoise.periodicity = 7
    this.densityNoise.harmonicsCount = 4
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
    const density = this.densityNoise.rawEval(
      x * scaling,
      y * scaling,
      z * scaling,
    )
    // adaptative density threshold based on terrain height
    const threshold = Math.sin((blockPos.y / groundLevel) * Math.PI) * 0.5
    return density < threshold
  }
}
