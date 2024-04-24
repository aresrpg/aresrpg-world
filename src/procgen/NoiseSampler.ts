import { createNoise2D } from 'simplex-noise'
import { Vector2, Vector3 } from 'three'
import alea from 'alea'

import { sanitiseNoise } from '../common/utils'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number

export interface Sampler<InputType> {
  parent: any
  // userScale: number;   // scale applied to sampler user input when querying sample
  // density: number // intrinsic sample density
  // querying sample value from input
  eval(input: InputType): number
  onChange(origin: any): void
  // set config(config: any)
}

type Harmonic = {
  period: number
  amplitude: number
}

export class SimplexNoiseSampler implements Sampler<InputType> {
  harmonics: Harmonic[] = []
  harmonicsAmplitudeSum: number = 0
  noiseSource: any
  params = {
    periodicity: 64,
    harmonics: {
      // period: 64,
      count: 1,
      spread: 2,
      gain: 1,
    },
  }

  shadowParams = {}
  stats = {}
  parent: any

  constructor(seed: string = '') {
    // create a new random function based on the seed
    const prng = alea(seed)
    this.noiseSource = createNoise2D(prng)
  }

  get harmonicsCount() {
    return this.params.harmonics.count
  }

  set harmonicsCount(count) {
    this.params.harmonics.count = count
    this.onChange('harmonicsCount')
  }

  get harmonicGain() {
    return this.params.harmonics.gain
  }

  set harmonicGain(gain) {
    this.params.harmonics.gain = gain
    this.onChange('harmonicGain')
  }

  get harmonicSpread() {
    return this.params.harmonics.spread
  }

  set harmonicSpread(spread) {
    this.params.harmonics.spread = spread
    this.onChange('harmonicSpread')
  }

  get periodicity() {
    return this.params.periodicity
  }

  set periodicity(val) {
    this.params.periodicity = val
    this.onChange('periodicity')
  }

  // get density() {
  //   return this.params.density
  // }

  // set density(val) {
  //   this.params.density = val
  //   this.onChange('density')
  // }

  // get scattering() {
  //   return this.shadowParams.scatterFactor
  // }

  // set scattering(val) {
  //   this.shadowParams.scatterFactor = val
  //   const scattering = 1 / Math.pow(2, val)
  //   // this.density =
  //   // this.onChange('scattering')
  // }

  onChange(originator: any) {
    console.debug(`[Sampler:onChange] from ${originator}`)
    const { harmonics } = this.params
    const periodicity = Math.pow(2, this.params.periodicity)
    this.harmonics = Array.from(new Array(harmonics.count)).map((_v, i) => {
      // this.stats['h' + i] = { min: 1, max: 0 }
      const period = periodicity / Math.pow(harmonics.spread, i)
      const amplitude = Math.pow(harmonics.gain, i)
      return { period, amplitude }
    })
    this.harmonicsAmplitudeSum = this.harmonics.reduce(
      (sum, harm) => sum + harm.amplitude,
      0,
    )
    this.parent?.onChange(`Sampler:${originator}`)
  }

  eval(input: InputType): number {
    const { x, y } = input
    const density = Math.pow(2, 6)
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
