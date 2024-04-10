import { HeightProfiler } from './HeightProfiler'
import { InputType, SimplexNoiseSampler } from './NoiseSampler'
/**
 * blend threshold and transition
 */
type LayerTransition = {
  lower: number
  upper: number
}

const DEFAULT_TRANSITION: LayerTransition = {
  lower: 0.45,
  upper: 0.55,
}

export type Compositor = (base: number, val: number, weight: number) => number

export enum BlendMode {
  ADD = 'addition',
  SUB = 'difference',
  MUL = 'product',
  DIV = 'division',
  MIN = 'brighter',
  MAX = 'darker',
}

const NOISE_SCALE = 0.007

/**
 * @param mode
 * @returns compositor function
 */
export const getCompositor = (blendMode: BlendMode): Compositor => {
  switch (blendMode) {
    case BlendMode.ADD:
      return (b, v, w) => b + w * v
    case BlendMode.SUB:
      return (b, v, w) => b - w * v
    case BlendMode.MUL:
      return (b, v, w) => b * w * v
    case BlendMode.DIV:
      return (b, v, w) => b / (w * v)
    case BlendMode.MIN:
      return (b, v, w) => Math.max(b, w * v)
    case BlendMode.MAX:
      return (b, v, w) => Math.min(b, w * v)
  }
}

/**
 * Base class for linking several layer and combining them
 */
export abstract class GenLayer {
  parent: any
  // eslint-disable-next-line no-use-before-define
  next: GenLayer | undefined // linked layer for combination mode
  // profile: HeightProfiler = DEFAULT_PROFILE
  transition: LayerTransition = DEFAULT_TRANSITION // used to transition from one layer to another
  name: string // unique layer identifier
  // abstract rawEval(input: InputType): number

  constructor(layerName: string) {
    this.name = layerName
  }

  /**
   * Layer's own value
   * @param input
   * @returns
   */
  abstract eval(input: InputType): number

  /**
   * Layers combination: aggregate values from all layers
   * @param input
   * @returns
   */
  abstract recursiveEval(input: InputType): number

  onChange(originator: any) {
    console.log(`[GenLayer] ${typeof originator} config has changed`)
    this.parent?.onChange(originator)
  }

  /**
   * Blend 2 layers according to blending layer at point eval
   * - val < lowerBound => layer1
   * - val > upperBound => layer2
   * - lowerBound < val < upperBound => lerp between layer 1 and layer 2
   * @param layers
   * @param evalPoint
   */
  static blendLayers(layer1: GenLayer, layer2: GenLayer, blendmap: any) {
    const combinedLayers = (input: InputType) => {
      const { transition } = blendmap
      const blendVal = blendmap.eval(input)
      if (blendVal <= transition.lower) {
        return layer1.eval(input)
      } else if (blendVal >= transition.upper) {
        return layer2.eval(input)
      } else {
        const blendFactor =
          (blendVal - transition.lower) / (transition.upper - transition.lower)
        const val1 = layer1.eval(input)
        const val2 = layer2.eval(input)
        const blendEval = val1 * (1 - blendFactor) + val2 * blendFactor
        return blendEval
      }
    }
    return combinedLayers
  }

  static combine(input: InputType, layerChain: GenLayer, selected: string) {
    let pointVal = 0
    if (selected === 'combination') {
      pointVal = layerChain.recursiveEval(input)
    } else {
      const selectedLayer = GenLayer.getLayer(layerChain, selected)
      pointVal = selectedLayer.eval(input)
    }
    // else if (selected.startsWith('layer')) {
    //   const layerIndex = parseInt(selected.split('#')[1] || '')
    //   const selectedLayer = GenLayer.getLayerAtIndex(layerChain, layerIndex)
    //   pointVal = selectedLayer.eval(input)
    // }
    return pointVal
  }

  static toArray(firstLayer: GenLayer) {
    const layers = [firstLayer]
    let layer = firstLayer
    while (layer.next) {
      layers.push(layer.next)
      layer = layer.next
    }
    return layers
  }

  static getLayer(layerChain: GenLayer, layerName: string) {
    let layer = layerChain
    while (layer.name !== layerName && layer.next) {
      layer = layer.next
    }
    return layer
  }

  static getLayerAtIndex(layerChain: GenLayer, layerIndex: number) {
    let layer = layerChain
    let index = 0
    while (layer.next && index < layerIndex) {
      layer = layer.next
      index++
    }
    return layer
  }
}

export class ProcGenLayer extends GenLayer {
  noiseSampler!: SimplexNoiseSampler
  samplerProfile!: HeightProfiler
  compositor: Compositor = getCompositor(BlendMode.ADD) // addition assigned by default
  params = {
    blending: {
      weight: 0,
      mode: BlendMode.ADD,
    },
    spreading: 1,
  }

  stats = {
    range: {
      min: 1,
      max: 0,
    },
  }

  // first init
  init(config: any) {
    this.noiseSampler = new SimplexNoiseSampler(config.seed)
    this.samplerProfile = HeightProfiler.fromArray(config.spline)
    // Layer
    const blendWeight = config.blend_weight
    const blendMode = config.blend_mode
    const layerCfg = {
      blendWeight,
      blendMode,
      spreading: config.spread - 0.7,
    }
    this.config = layerCfg
    // Sampler
    const samplerCfg = {
      noise: {
        harmonics: {
          period: config.period,
          count: config.harmonics + 1,
          spread: config.harmonic_spread,
          gain: config.harmonic_gain,
        },
      },
    }
    this.noiseSampler.config = samplerCfg
  }

  eval(input: InputType) {
    const { noiseSampler } = this
    const spread = this.config.spreading
    const rawVal = noiseSampler.eval(input.clone().multiplyScalar(NOISE_SCALE))
    const finalVal = this.samplerProfile.apply(
      (rawVal - 0.5) * 2 ** spread + 0.5,
    )
    return finalVal
  }

  recursiveEval(input: InputType) {
    // const vals = this.next?.recursiveEval() || 0
    // const val = this.eval(input.clone());
    // // blend current val with other vals
    // return this.compositor(vals, val / 255) * 255;
    const layers: ProcGenLayer[] = GenLayer.toArray(this) as ProcGenLayer[]
    let val
    let vals = 0
    layers.forEach(layer => {
      val = layer.eval(input.clone())
      vals = layer.compositor(vals, val, layer.params.blending.weight)
    })
    return vals
  }

  static layerIndex(index: number) {
    return `layer#${index}`
  }

  get config() {
    return this.params
  }

  set config(conf: any) {
    this.params.blending.weight = !isNaN(conf.blendWeight)
      ? conf.blendWeight
      : this.params.blending.weight
    if (conf.blendMode) {
      this.params.blending.mode = conf.blendMode
      this.compositor = getCompositor(conf.blendMode)
    }
    this.params.spreading = !isNaN(conf.spreading)
      ? conf.spreading
      : this.params.spreading
  }

  static fromJsonConfig(jsonConf: any) {
    // console.log(jsonConf)
    const layers: ProcGenLayer[] = jsonConf.procLayers.map(
      (layerCfg: any, i: number) => {
        const layerName = `layer#${i}`
        const procLayer = new ProcGenLayer(layerName)
        procLayer.init(layerCfg)
        return procLayer
      },
    )
    layers.reduce((prev, curr) => {
      prev.next = curr
      return curr
    })
    return layers[0]
  }
}
