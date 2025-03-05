import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise'
import { Vector2, Vector3 } from 'three'

import Alea from '../third-party/alea.js'
import { clamp } from '../utils/math_utils.js'
import { worldRootEnv } from '../config/WorldEnv.js'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number

type Harmonic = {
  period: number
  amplitude: number
}

export enum NoiseDimension {
  Two,
  Three,
  Four,
}

const noiseConstructor: Record<NoiseDimension, (prng: any) => any> = {
  [NoiseDimension.Two]: (prng: any) => createNoise2D(prng),
  [NoiseDimension.Three]: (prng: any) => createNoise3D(prng),
  [NoiseDimension.Four]: (prng: any) => createNoise4D(prng),
}
type NoiseHarmonicsSettings = {
  count: number
  spread: number
  gain: number
}
export type NoiseSamplerParams = {
  seed: string
  periodicity: number
  harmonics: NoiseHarmonicsSettings
  dimensions: NoiseDimension
}

export class NoiseSampler {
  // eslint-disable-next-line no-use-before-define
  static instances: NoiseSampler[] = []
  harmonics: Harmonic[] = []
  harmonicsAmplitudeSum: number = 0
  noiseSource: any
  params: NoiseSamplerParams = {
    seed: '',
    periodicity: 7, // = 128 by default
    harmonics: {
      count: 1,
      spread: 2,
      gain: 0.5,
    },
    dimensions: NoiseDimension.Two,
  }

  shadowParams = {}
  stats = {}
  parent: any

  constructor(name = '', noiseDimension = NoiseDimension.Two) {
    this.params.seed = worldRootEnv.rawSettings.seeds.main || name
    this.params.dimensions = noiseDimension
    this.init()
    NoiseSampler.instances.push(this)
  }

  init() {
    // create a new random function based on the seed
    const prng = Alea(this.seed)
    this.noiseSource = noiseConstructor[this.params.dimensions](prng)
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

  set seed(seed: string | null | undefined) {
    if (seed) {
      this.params.seed = seed
      this.onChange('seed')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange(_originator: any) {
    // console.debug(`[Sampler:onChange] from ${_originator}`)
    this.init()
    // this.parent?.onChange(`Sampler:${_originator}`)
  }

  eval(x: number, y: number, z?: number, t?: number): number {
    // const { x, y, z } = input
    // const y = input instanceof Vector2 ? input.y : input.z
    const density = Math.pow(2, 6) // TODO remove hardcoding
    let noiseEval
    let noise = 0
    this.harmonics
      // .map(p=>1/p)    // mapping periods to frequency
      .forEach((harmonic: Harmonic) => {
        noiseEval = this.noiseSource(
          (x * density) / harmonic.period,
          (y * density) / harmonic.period,
          ((z || 0) * density) / harmonic.period,
          t,
        )
        noise += (noiseEval * 0.5 + 0.5) * harmonic.amplitude /// Math.pow(2, i + 1)
      })
    noise /= this.harmonicsAmplitudeSum
    return clamp(noise, 0, 1)
  }
}
