import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { Vector2 } from 'three'

import { sanitiseNoise } from '../common/utils'

export interface ISampler<InputType> {
  // userScale: number;   // scale applied to sampler user input when querying sample
  density: number // intrinsic sample density
  source
  // querying sample value from input
  query(input: InputType)
}

/**
 * Sampling points from noise source
 */
export class ProceduralNoise2DSampler implements ISampler<Vector2> {
  source: any
  density: any // TODO
  constructor() {
    this.source = new SimplexNoise()
  }

  query(input: Vector2) {
    const { x, y } = input
    const freq = [0.0125, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8]
    let noise = 0
    for (let i = 0; i < freq.length; i++) {
      noise +=
        (this.source.noise3d(x * freq[i], y * freq[i], 0) + 0.5) /
        Math.pow(2, i + 1) //
    }
    return sanitiseNoise(noise)
  }
}
