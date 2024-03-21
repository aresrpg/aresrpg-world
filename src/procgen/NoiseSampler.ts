import { createNoise2D } from 'simplex-noise'
import { Vector2, Vector3 } from 'three'

import { sanitiseNoise } from '../common/utils'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number

export interface Sampler<InputType> {
  parent: any
  // userScale: number;   // scale applied to sampler user input when querying sample
  density: number // intrinsic sample density
  // querying sample value from input
  eval(input: InputType): number
  get config(): any
  set config(config: any)
}

type Harmonic = {
  period: number
  amplitude: number
}

export class SimplexNoiseSampler implements Sampler<InputType> {
  density: number
  harmonics: Harmonic[] = []
  harmonicsAmplitudeSum: number
  noiseSource: any
  noiseParams = {
    harmonics: {
      period: 64,
      count: 1,
      spread: 2,
      gain: 1,
    },
  }

  stats = {}
  parent: any

  constructor() {
    this.noiseSource = createNoise2D()
    this.density = 128
  }

  get config(): any {
    return {
      density: this.density,
      noiseParams: this.noiseParams,
    }
  }

  set config(params: any) {
    this.noiseParams = params.noise || this.noiseParams
    const density = !isNaN(params.scattering)
      ? 1 / Math.pow(2, params.scattering)
      : params.density
    this.density = !isNaN(density) ? density : this.density
    this.onChange(this)
  }

  onChange(originator: any) {
    const { harmonics } = this.noiseParams
    this.harmonics = Array.from(new Array(harmonics.count)).map((_v, i) => {
      // this.stats['h' + i] = { min: 1, max: 0 }
      const period = harmonics.period / Math.pow(harmonics.spread, i)
      const amplitude = Math.pow(harmonics.gain, i)
      return { period, amplitude }
    })
    this.harmonicsAmplitudeSum = this.harmonics.reduce(
      (sum, harm) => sum + harm.amplitude,
      0,
    )
    this.parent?.onChange(originator)
  }

  eval(input: InputType): number {
    const { x, y } = input
    const { density } = this
    let noiseEval
    let noise = 0
    this.harmonics
      // .map(p=>1/p)    // mapping periods to frequency
      .forEach((harmonic: Harmonic) => {
        noiseEval = this.noiseSource(
          (x * density) / harmonic.period,
          (y * density) / harmonic.period,
        )
        noise += (noiseEval * 0.5 + 0.5) * harmonic.amplitude /// Math.pow(2, i + 1)
      })
    noise /= this.harmonicsAmplitudeSum
    return sanitiseNoise(noise)
  }
}
