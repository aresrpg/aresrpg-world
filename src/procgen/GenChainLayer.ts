import { Vector2 } from 'three'
import { round2 } from '../common/utils'
import { CurvePresets, HeightProfiler } from './HeightProfiler'
import { InputType, Sampler, SimplexNoiseSampler } from './NoiseSampler'
/**
 * blend threshold and transition
 */
type LayerTransition = {
    lower: number,
    upper: number
}

/**
 * Generation modes:

Generation modes: 
 * ONE LAYER
 * showing only selected layer for debug/visualization purpose
 * BLEND
 * two layers blended together according to blending map acting as layer selector
 * COMBINE_ALL
 * Generation starts by evaluating first layer:
 * - if value below threshold return current value
 * - if value above threshold, move to next layer and repeat until value below threshold 
 * or no profile remains
 * Depending on blend/override mode, matching layer:
 * - override all preceding layers
 * - or blend with previous layers to avoid discontinuity
 */
export enum CombineMode {
    CURRENT = "current",
    BLEND_WITH_NEXT = "blend_next",
    COMBINE_ALL = "comb_all",
    ALL_MIN = "all_min",
    ALL_MAX = "all_max",
    MIN_MAX_ALTERNATE = "all_min_max"
}

const DEFAULT_TRANSITION: LayerTransition = {
    lower: 0.45,
    upper: 0.55
}

// GenLayersChain
// GenLayersChain.compose(firstLayer)

/**
 * must be inserted in LayersCombinator to be used
 */
// interface GenSourceLayer {

// }

// export class ProcGenSourceLayer implements GenSourceLayer {

// }
/**
 * Layer composition/blending
 * Combining several SourceLayer to aggregate and mix their values
 */
// export class LayersCombinator {

// }

/**
 * Support for linking several layer and combining them
 */
export class GenChainLayer {
    // layer selector, used for switching from one layer to another
    static blendmap: GenChainLayer
    static first: GenChainLayer  // ref to first layer for combination mode
    parent: any
    sampler
    profile: HeightProfiler
    transition: LayerTransition = DEFAULT_TRANSITION    // used to transition from one layer to another
    next: GenChainLayer | undefined // linked layer for combination mode

    /**
   * required:
   * - sampler + height profile
   * - threshold: for combination mode
   */
    constructor(sampler: Sampler<Vector2>, profile: HeightProfiler, transition: LayerTransition = DEFAULT_TRANSITION) {
        this.sampler = sampler
        this.sampler.parent = this
        this.profile = profile
        this.transition = transition
    }

    static instanceFromConf(conf: any) {
        const { profile, scattering, threshold: transitionThreshold } = conf
        const density = 1 / Math.pow(2, scattering)
        const sampler = new SimplexNoiseSampler()
        sampler.density = density
        sampler.config = {
            density,
            noise: {
                harmonics: {
                    period: 80,
                    count: 7,
                    spread: 2,
                    gain: 0.5,
                    total_amplitude: 1
                }
            }
        }
        const profiler = new HeightProfiler(CurvePresets[profile])
        const transitionRange = 0.1
        const transition = {
            lower: round2(transitionThreshold - transitionRange / 2),
            upper: round2(transitionThreshold + transitionRange / 2)
        }
        return new GenChainLayer(sampler, profiler, transition)
    }

    /**
      * Blend 2 layers according to blending layer at point eval
      * - val < lowerBound => layer1
      * - val > upperBound => layer2
      * - lowerBound < val < upperBound => lerp between layer 1 and layer 2
      * @param layers 
      * @param evalPoint 
      */
    static blendLayers(layer1: GenChainLayer, layer2: GenChainLayer) {
        const combinedLayers = (input: InputType) => {
            const blendmap = GenChainLayer.blendmap
            const { transition } = blendmap
            const blendVal = blendmap.eval(input);
            if (blendVal <= transition.lower) {
                return layer1.eval(input);
            } else if (blendVal >= transition.upper) {
                return layer2.eval(input);
            } else {
                const blendFactor = (blendVal - transition.lower) / (transition.upper - transition.lower);
                const val1 = layer1.eval(input);
                const val2 = layer2.eval(input);
                const blendEval = val1 * (1 - blendFactor) + val2 * (blendFactor)
                return blendEval
            }
        }
        return combinedLayers
    }

    static minValue(layer1: GenChainLayer, layer2: GenChainLayer, input: InputType) {
        const val1 = layer1.eval(input);
        const val2 = layer2.eval(input);
        return Math.min(val1, val2)
    }

    static maxValue(layer1: GenChainLayer, layer2: GenChainLayer, input: InputType) {
        const val1 = layer1.eval(input);
        const val2 = layer2.eval(input);
        return Math.max(val1, val2)
    }

    static minMaxAlternate(layer1: GenChainLayer, layer2: GenChainLayer, input: InputType) {
        const blendmap = GenChainLayer.blendmap
        const { transition } = blendmap
        const blendVal = blendmap.eval(input);
        if (blendVal <= transition.lower) {
            return this.minValue(layer1, layer2, input)
        } else if (blendVal >= transition.upper) {
            return this.maxValue(layer1, layer2, input)
        } else {
            const blendFactor = (blendVal - transition.lower) / (transition.upper - transition.lower);
            const val1 = this.minValue(layer1, layer2, input);
            const val2 = this.maxValue(layer1, layer2, input);
            const blendEval = val1 * (1 - blendFactor) + val2 * (blendFactor)
            return blendEval
        }
    }

    /**
     * Profiles are linked in specific order and depending on threshold defined in layer 
    * and value evaluated, apply current layer or move to next one.
     * @param input 
     * @returns 
     */
    combine(input: InputType) {
        const { transition } = this
        const rawVal = this.rawEval((input as Vector2))
        // apply current layer if value is below below threshold or if no other layer remains
        if (rawVal <= transition.lower || !this.next) {
            // current layers
            return this.profile.apply(rawVal)
        } else if (rawVal < transition.upper) {
            // blend current with next layer
            const { transition } = this
            const blendFactor = (rawVal - transition.lower) / (transition.upper - transition.lower);
            const val1 = this.eval(input);
            const val2 = this.next.eval(input);
            const blendEval = val1 * (1 - blendFactor) + val2 * (blendFactor)
            return blendEval
        } else {
            // override with next layer
            return this.next.eval(input)
        }
    }

    /**
     * raw value without profile
     * @param input 
     * @returns 
     */
    rawEval(input: InputType) {
        return this.sampler.eval((input as Vector2))
    }

    /**
     * profile apply on raw val
     * @param input 
     * @returns 
     */
    eval(input: InputType) {
        const rawVal = this.rawEval((input as Vector2))
        return this.profile.apply(rawVal)
    }

    onChange(originator: any) {
        console.log(`[GenChainLayer] ${typeof originator} config has changed`)
        this.parent?.onChange(originator)
    }

    static getLayerAtIndex(layerChain: GenChainLayer, layerIndex: number) {
        let layer = layerChain
        let index = 0
        while (layer.next && index < layerIndex) {
            layer = layer.next
            index++
        }
        return layer
    }

    static combineEvals(input: InputType, layerChain: GenChainLayer, mode: CombineMode) {
        let pointVal = 0;
        switch (mode) {
            case CombineMode.CURRENT:
                pointVal = layerChain.eval(input)
                break
            case CombineMode.COMBINE_ALL:
                pointVal = layerChain.combine(input)
                break;
            // case CombineMode.BLEND_WITH_NEXT:
            //     pointVal = GenChainLayer.blendLayers(layerChain, layerChain.next)(input)
            //     break;
            // case CombineMode.MIN:
            //     pointVal = GenChainLayer.minValue(layerChain, layerChain.next, input)
            //     break;
            // case CombineMode.MAX:
            //     pointVal = GenChainLayer.maxValue(layerChain, layerChain.next, input)
            //     break;
            // case CombineMode.MIN_MAX_ALTERNATE:
            //     pointVal = GenChainLayer.minMaxAlternate(layerChain, layerChain.next, input)
            //     break;
        }
        return pointVal
    }
}