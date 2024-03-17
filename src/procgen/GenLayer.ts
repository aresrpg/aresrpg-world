import { Vector2 } from 'three'
import { HeightProfiler } from './HeightProfiler'
import { InputType, Sampler } from './NoiseSampler'

/**
 * blend threshold and transition
 */
type LayerTransition = {
    lower: number,
    upper: number
}

/**
 * Procedural Generation Layer 
 */
export class GenLayer {
    // layer selector, used for switching from one layer to another
    static blendmap: GenLayer
    static first: GenLayer  // ref to first layer for combination mode
    sampler
    profile: HeightProfiler
    transition: LayerTransition | undefined   // used to transition from one layer to another
    next: GenLayer | undefined // linked layer for combination mode

    /**
   * required:
   * - sampler + height profile
   * - threshold: for combination mode
   */
    constructor(sampler: Sampler<Vector2>, profile: HeightProfiler, transition: LayerTransition | undefined = undefined) {
        this.sampler = sampler
        this.profile = profile
        this.transition = transition
    }

    /**
      * Blend 2 layers according to blending layer at point eval
      * - val < lowerBound => layer1
      * - val > upperBound => layer2
      * - lowerBound < val < upperBound => lerp between layer 1 and layer 2
      * @param layers 
      * @param evalPoint 
      */
    static blendLayers(layer1: GenLayer, layer2: GenLayer) {
        const combinedLayers = (input: InputType) => {
            const blendmap = GenLayer.blendmap
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

    static minValue(layer1: GenLayer, layer2: GenLayer, input: InputType) {
        const val1 = layer1.eval(input);
        const val2 = layer2.eval(input);
        return Math.min(val1, val2)
    }

    static maxValue(layer1: GenLayer, layer2: GenLayer, input: InputType) {
        const val1 = layer1.eval(input);
        const val2 = layer2.eval(input);
        return Math.max(val1, val2)
    }

    static minMaxAlternate(layer1: GenLayer, layer2: GenLayer, input: InputType) {
        const blendmap = GenLayer.blendmap
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
     * @param blendFlag 
     * @returns 
     */
    combine(input: InputType, blendFlag = true) {
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

}