import { Vector2 } from 'three'

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
   * Layer's raw value
   * @param input
   * @returns
   */
  abstract rawEval(input: InputType): number

  /**
   * Layer's value
   * @param input
   * @returns
   */
  abstract eval(input: InputType): number

  /**
   * Layers combination: aggregate values from all layers
   * @param input
   * @returns
   */
  abstract combinedEval(input: InputType): number

  abstract combinedWith(
    input: InputType,
    layer: GenLayer,
    threshold: number,
  ): number

  abstract modulatedBy(
    input: InputType,
    layer: GenLayer,
    threshold: number,
  ): number

  onChange = (originator: any) => {
    // console.debug(`[GenLayer:onChange] from ${originator}`)
    this.parent?.onChange('GenLayer[' + this.name + ']:' + originator)
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
    this.samplerProfile = HeightProfiler.fromArray(config.spline, this.onChange)
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
    let periodicity = 0
    while (Math.pow(2, ++periodicity) <= config.period);
    this.noiseSampler.periodicity = periodicity - 1
    this.noiseSampler.harmonicsCount = config.harmonics + 1
    this.noiseSampler.harmonicGain = config.harmonic_gain
    this.noiseSampler.harmonicSpread = config.harmonic_spread
    // this.noiseSampler.config = samplerCfg
    this.noiseSampler.parent = this
  }

  rawEval(input: InputType) {
    const adapter =
      input instanceof Vector2 ? input : new Vector2(input.x, input.z)
    return this.noiseSampler.eval(adapter.clone().multiplyScalar(NOISE_SCALE))
  }

  eval(input: InputType) {
    const rawVal = this.rawEval(input)
    const spread = this.config.spreading

    const finalVal = this.samplerProfile.apply(
      (rawVal - 0.5) * 2 ** spread + 0.5,
    )
    return finalVal
  }

  combinedEval(input: InputType) {
    // const vals = this.next?.recursiveEval() || 0
    // const val = this.eval(input.clone());
    // // blend current val with other vals
    // return this.compositor(vals, val / 255) * 255;
    const layers: ProcGenLayer[] = GenLayer.toArray(this) as ProcGenLayer[]
    let val
    let acc = 0
    layers.forEach(layer => {
      val = layer.eval(input.clone())
      acc = layer.compositor(acc, val, layer.params.blending.weight)
    })
    return acc
  }

  /**
   * trigger other layer after threshold
   */
  combinedWith(input: InputType, layer: GenLayer, threshold: number) {
    const spread = this.config.spreading || 1
    const rawVal = this.rawEval(input)
    const noiseVal = (rawVal - 0.5) * 2 ** spread + 0.5
    const noiseAboveThreshold = noiseVal - threshold
    const baseVal = this.samplerProfile.apply(threshold)
    const targetVal = layer.eval(input)
    const initialVal = this.samplerProfile.apply(noiseVal - 0.01)
    let finalVal = initialVal
    // modulates amplitude after threshold
    if (noiseAboveThreshold > 0) {
      const blendWeight = 1 - 10 * noiseAboveThreshold
      const blendVal =
        blendWeight * baseVal + 10 * noiseAboveThreshold * targetVal
      // const blendVal = getCompositor(BlendMode.MUL)(initialVal, targetVal, blendWeight)
      finalVal = noiseAboveThreshold < 0.1 ? blendVal : targetVal
    }
    return finalVal
  }

  /**
   * Use another layer to modulate layer's amplitude after threshold
   */
  modulatedBy(input: InputType, modulator: GenLayer, threshold: number) {
    const compositor = getCompositor(BlendMode.MUL)
    const spread = this.config.spreading || 1
    const rawVal = this.rawEval(input)
    const noiseAboveThreshold = rawVal - threshold
    const baseVal = this.samplerProfile.apply((threshold - 0.5) * 2 ** spread + 0.5)
    const initialVal = this.samplerProfile.apply((rawVal - 0.5) * 2 ** spread + 0.5)
    let finalVal = initialVal
    // modulates amplitude after threshold
    if (noiseAboveThreshold > 0) {
      // noiseAboveThreshold = compositor(noiseAboveThreshold, (erosion + 0.5), 1)
      //  modulated = (continentalnessLayer as ProcGenLayer).samplerProfile.apply(noiseAboveThreshold)
      const modulation = modulator.rawEval(input)
      let modulatedVal = initialVal - baseVal
      // modulatedVal = compositor(noiseAboveThreshold, modulation, 1)
      modulatedVal = compositor(modulatedVal, modulation, 1)
      finalVal = baseVal + modulatedVal
    }
    // val = GenLayer.combinedEval(
    //   scaledNoisePos,
    //   this.procLayers,
    //   this.layerSelection,
    // )
    return finalVal
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
