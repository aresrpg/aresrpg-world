import { Vector2 } from 'three'

import { LinkedList } from '../common/misc'
import { ProcLayerExtCfg } from '../common/types'

import { CurvePresets, HeightProfiler } from './HeightProfiler'
import { InputType, SimplexNoiseSampler } from './NoiseSampler'

const NOISE_SCALE = 0.007

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

export enum EvalMode {
  Default = 'default', // profiled
  Raw = 'raw', // pure noise value
  Lower = 'lower', // lower profile bound
  Upper = 'upper', // upper profile bound
}

export enum BlendMode {
  ADD = 'addition',
  SUB = 'difference',
  MUL = 'product',
  DIV = 'division',
  MIN = 'brighter',
  MAX = 'darker',
}

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

export class ProcGenLayer {
  name: string // layer identifier
  parent: any
  transition: LayerTransition = DEFAULT_TRANSITION // used to transition from one layer to another
  noiseSampler!: SimplexNoiseSampler
  samplerProfile!: HeightProfiler
  compositor: Compositor = getCompositor(BlendMode.ADD) // addition assigned by default
  params = {
    blending: {
      weight: 1,
      mode: BlendMode.ADD,
      threshold: 1, // disable blending by default
    },
    spreading: 0,
  }

  stats = {
    range: {
      min: 1,
      max: 0,
    },
  }

  constructor(layerName: string) {
    this.name = layerName
    this.noiseSampler = new SimplexNoiseSampler(layerName)
    this.noiseSampler.parent = this
    this.samplerProfile = HeightProfiler.fromArray(
      CurvePresets.identity,
      this.onChange,
    )
  }

  get spreading() {
    return this.params.spreading
  }

  set spreading(spreading: number) {
    this.params.spreading = spreading
  }

  get blendingWeight() {
    return this.params.blending.weight
  }

  set blendingWeight(weight: number) {
    this.params.blending.weight = weight
  }

  get blendingMode() {
    return this.params.blending.mode
  }

  set blendingMode(mode: BlendMode) {
    this.params.blending.mode = mode
    this.compositor = getCompositor(mode)
  }

  onChange = (originator: any) => {
    // console.debug(`[GenLayer:onChange] from ${originator}`)
    this.parent?.onChange('ProcGenLayer[' + this.name + ']:' + originator)
  }

  eval(input: InputType, mode = EvalMode.Default) {
    const adapter =
      input instanceof Vector2 ? input : new Vector2(input.x, input.z)
    const rawVal = this.noiseSampler.eval(
      adapter.clone().multiplyScalar(NOISE_SCALE),
    )
    const val = (rawVal - 0.5) * 2 ** this.spreading + 0.5
    switch (mode) {
      case EvalMode.Raw:
        return rawVal
      case EvalMode.Lower:
        return this.samplerProfile.getLower(val)
      default:
        return this.samplerProfile.apply(val)
    }
  }

  /**
   * Use another layer to modulate layer's amplitude after threshold
   */
  modulatedBy(input: InputType, modLayer: ProcGenLayer, threshold: number) {
    const compositor = getCompositor(modLayer.blendingMode)
    const initialVal = this.eval(input)
    let finalVal = initialVal
    const aboveThreshold = initialVal - threshold // rawVal - threshold
    // modulates height after threshold according to amplitude layer
    if (aboveThreshold > 0) {
      const modulation = modLayer.eval(input, EvalMode.Raw)
      let modulatedVal = aboveThreshold // initialVal - baseVal
      // modulatedVal = compositor(noiseAboveThreshold, modulation, 1)
      const { blendingWeight } = modLayer
      // blendingWeight /= (threshold + modulatedVal) > 0.8 ? 1.2 : 1
      modulatedVal = compositor(modulatedVal, modulation, blendingWeight)
      finalVal = threshold + modulatedVal
    }
    return finalVal
  }

  importConf(extConf: ProcLayerExtCfg) {
    this.blendingWeight = extConf.blend_weight
    this.blendingMode = extConf.blend_mode
    this.spreading = extConf.spread - 0.7
    this.noiseSampler.importConf(extConf)
    this.samplerProfile = HeightProfiler.fromArray(
      extConf.spline,
      this.onChange,
    )
  }

  exportConf(): ProcLayerExtCfg {
    const samplerConf = this.noiseSampler.exportConf()
    const layerConf = {
      blend_weight: this.blendingWeight,
      blend_mode: this.blendingMode,
      spread: this.spreading,
      spline: [], // todo
      ...samplerConf,
    }
    return layerConf
  }

  static parseLayersConf(externalConf: any): LinkedList<ProcGenLayer> {
    // console.log(jsonConf)
    const importedLayers: ProcGenLayer[] = externalConf.map(
      (layerCfg: ProcLayerExtCfg, i: number) => {
        const layerName = `layer#${i}`
        const procLayer = new ProcGenLayer(layerName)
        procLayer.importConf(layerCfg)
        return procLayer
      },
    )
    const linkedLayers = LinkedList.fromArray<ProcGenLayer>(importedLayers)
    return linkedLayers
  }

  static getLinkedLayer(
    linkedLayers: LinkedList<ProcGenLayer>,
    layerName: string,
  ) {
    let layer: LinkedList<ProcGenLayer> | undefined = linkedLayers
    while (layer && layer.data.name !== layerName) {
      layer = layer.next
    }
    return layer?.data
  }

  /**
   * Combining linked layers (experimental)
   */
  static combineAll(linkedLayers: LinkedList<ProcGenLayer>, input: InputType) {
    let currentItem: LinkedList<ProcGenLayer> | undefined = linkedLayers
    let acc = 0
    let done = false
    while (currentItem && !done) {
      const currentLayer = currentItem.data
      const { mode, weight, threshold } = currentLayer.params.blending
      const currentVal = currentLayer.eval(input.clone())
      const compositor = getCompositor(mode)
      acc = compositor(acc, currentVal, weight)
      done = currentVal < threshold
      currentItem = currentItem.next
    }
    return acc
  }
  // static smoothCombine(linkedLayers: LinkedList<ProcGenLayer>, input: InputType) {
  //   let currentItem: LinkedList<ProcGenLayer> | undefined = linkedLayers
  //   let retained = 0, buffer = 0
  //   while (currentItem) {
  //     const currentLayer = currentItem.data
  //     const { mode, weight, threshold: belowThreshold } = currentLayer.params.blending
  //     let currentVal = currentLayer.eval(input)
  //     if (currentLayer.name === "amplitude_mod") currentVal += 0.5
  //     const aboveThreshold = Math.max(currentVal - belowThreshold, 0)
  //     const compositor = getCompositor(mode)
  //     // const lowerVal = currentLayer.eval(input, EvalMode.Lower)
  //     buffer = aboveThreshold > 0 ? aboveThreshold : compositor(buffer, currentVal, weight)
  //     retained += aboveThreshold > 0 ? belowThreshold : buffer
  //     // buffer = 0
  //     currentItem = aboveThreshold && currentItem.next
  //   }
  //   return retained
  // }

  /**
   * trigger other layer after threshold
   */
  // combinedWith(input: InputType, layer: GenLayer, threshold: number) {
  //   const spread = this.spreading || 1
  //   const rawVal = this.rawEval(input)
  //   const noiseVal = (rawVal - 0.5) * 2 ** spread + 0.5
  //   const noiseAboveThreshold = noiseVal - threshold
  //   const baseVal = this.samplerProfile.apply(threshold)
  //   const targetVal = layer.eval(input)
  //   const initialVal = this.samplerProfile.apply(noiseVal - 0.01)
  //   let finalVal = initialVal
  //   // modulates amplitude after threshold
  //   if (noiseAboveThreshold > 0) {
  //     const blendWeight = 1 - 10 * noiseAboveThreshold
  //     const blendVal =
  //       blendWeight * baseVal + 10 * noiseAboveThreshold * targetVal
  //     // const blendVal = getCompositor(BlendMode.MUL)(initialVal, targetVal, blendWeight)
  //     finalVal = noiseAboveThreshold < 0.1 ? blendVal : targetVal
  //   }
  //   return finalVal
  // }
}
