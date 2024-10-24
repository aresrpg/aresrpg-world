import { InputType, NoiseSampler } from './NoiseSampler'

/**
 * # Procedural Generation Layer
 */
export class ProcLayer {
  name: string // layer identifier
  parent: any
  sampling!: NoiseSampler
  params = {
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

  eval(rawInput: InputType) {
    this.lastInput = rawInput
    const input = rawInput.clone().multiplyScalar(this.params.scaling)
    const noiseVal = this.sampling.eval(input)
    this.lastEval.noise = noiseVal
    const rawVal = (noiseVal - 0.5) * 2 ** this.params.spreading + 0.5
    this.lastEval.raw = rawVal
    // val = this.mapping.apply(val)
    return rawVal
  }
}
