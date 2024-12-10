import { Vector3 } from 'three'

import { InputType, NoiseSampler } from './NoiseSampler'

export type ProcLayerParams = {
  spreading: number
  scaling: number
}

/**
 * # Procedural Generation Layer
 */
export class ProcLayer {
  name: string // layer identifier
  parent: any
  sampling!: NoiseSampler
  params: ProcLayerParams = {
    spreading: 0,
    scaling: 0.001,
  }

  lastInput?: InputType
  lastEval = {
    noise: 0,
    raw: 0,
    // mapping: 0
  }

  stats = {
    range: {
      min: 1,
      max: 0,
    },
  }

  constructor(layerName: string) {
    this.name = layerName
    this.sampling = new NoiseSampler(layerName)
    this.sampling.parent = this
    // this.samplerProfile = HeightProfiler.fromArray(
    //   CurvePresets.identity,
    //   this.onChange,
    // )
  }

  eval(rawInput: Vector3) {
    const { scaling } = this.params
    const { x, z } = rawInput
    this.lastInput = rawInput
    const noiseVal = this.sampling.eval(x * scaling, z * scaling)
    this.lastEval.noise = noiseVal
    const rawVal = (noiseVal - 0.5) * 2 ** this.params.spreading + 0.5
    this.lastEval.raw = rawVal
    // val = this.mapping.apply(val)
    return rawVal
  }
}
