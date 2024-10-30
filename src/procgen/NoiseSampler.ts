import { createNoise2D } from 'simplex-noise'
import alea from 'alea'
import { Vector2, Vector3 } from 'three'

import * as Utils from '../utils/common'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number

type Harmonic = {
  period: number
  amplitude: number
}

export class NoiseSampler {
  harmonics: Harmonic[] = []
  harmonicsAmplitudeSum: number = 0
  noiseSource: any
  params = {
    seed: '',
    periodicity: 7, // = 128 by default
    harmonics: {
      count: 1,
      spread: 2,
      gain: 0.5,
    },
  }

  shadowParams = {}
  stats = {}
  parent: any

  constructor(seed = '') {
    this.params.seed = seed
    this.init()
  }

  init() {
    // create a new random function based on the seed
    const prng = alea(this.seed)
    this.noiseSource = createNoise2D(prng)
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

  get seed() {
    return this.params.seed
  }

  set seed(seed) {
    this.params.seed = seed
    this.onChange('seed')
  }

  onChange(originator: any) {
    console.debug(`[Sampler:onChange] from ${originator}`)
    this.init()
    // this.parent?.onChange(`Sampler:${originator}`)
  }

  eval(input: InputType): number {
    const { x } = input
    const y = input instanceof Vector2 ? input.y : input.z
    const density = Math.pow(2, 6) // TODO remove hardcoding
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
    return Utils.clamp(noise, 0, 1)
  }
}
