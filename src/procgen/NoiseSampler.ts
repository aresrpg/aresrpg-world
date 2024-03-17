import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js'
import { Vector2, Vector3 } from 'three'

import { sanitiseNoise } from '../common/utils'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number
const
export interface Sampler<InputType> {
  // userScale: number;   // scale applied to sampler user input when querying sample
  density: number // intrinsic sample density
  // querying sample value from input
  eval(input: InputType): number
}

export class CustomSampler<InputType> implements Sampler<InputType> {
  density: number
  generator: any
  constructor(generator: Generator) {
    this.generator = generator
    this.density = 1
  }
  eval(input: InputType): number {
    return this.generator(input)
  }

}

/**
 * Sampling points from noise source
 */
export class ProceduralNoiseSampler implements Sampler<InputType> {
  density: number = 1
  noiseSource

  constructor(density = 1, noiseSource = new SimplexNoise()) {
    this.density = density
    this.noiseSource = noiseSource
  }

  eval(input: InputType) {
    const { x, y } = input
    const { density } = this
    const freq = [0.0125, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8]
    let noise = 0
    freq.forEach((f: number, i: number) => {
      noise += (this.noiseSource.noise3d(x * f * density, y * f * density, 0 * density) + 0.5) / Math.pow(2, i + 1)
    })
    return sanitiseNoise(noise)
  }
}
