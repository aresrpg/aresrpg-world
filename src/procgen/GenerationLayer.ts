import { Vector2, Vector3 } from 'three'
import { HeightProfiler } from './HeightProfiler'
import { CustomSampler, InputType, Sampler } from './NoiseSampler'

// by default half/half homogeneous blending
const DEFAULT_BLEND_MAP = new CustomSampler(() => 0.5)
/**
 * Procedural Generation Layer 
 */
export class GenerationLayer {
    static blendmap: Sampler<InputType> = DEFAULT_BLEND_MAP // used for blending layers
    static first: GenerationLayer  // ref to first layer for combination mode
    sampler
    profile: HeightProfiler
    threshold: number
    next: GenerationLayer | undefined // linked layer for combination mode

    /**
   * required:
   * - sampler + height profile
   * - threshold: for combination mode
   */
    constructor(sampler: Sampler<Vector2>, profile: HeightProfiler, threshold: number) {
        this.sampler = sampler
        this.profile = profile
        this.threshold = threshold
    }

    /**
      * Blend 2 layers according to blending layer at point eval
      * @param layers 
      * @param evalPoint 
      */
    static blendLayers(layer1: GenerationLayer, layer2: GenerationLayer) {
        const combinedLayers = (input: InputType) => {
            const eval1 = layer1.eval(input);
            const eval2 = layer2.eval(input);
            const blendingFactor = GenerationLayer.blendmap.eval(input);
            const blendEval = eval1 * (blendingFactor) + eval2 * (1 - blendingFactor)
            return blendEval
        }
        return combinedLayers
    }

    /**
     * Blend current layer with another according to statically defined blending map
     */
    blendWith(layer: GenerationLayer) {
        return GenerationLayer.blendLayers(this, layer)
    }

    /**
     * Profiles are linked in specific order and depending on threshold defined in layer 
    * and value evaluated, apply current layer or move to next one.
     * @param input 
     * @param blendFlag 
     * @returns 
     */
    combine(input: InputType, blendFlag = true) {
        let val = this.sampler.eval((input as Vector2))
        // apply current layer if value is below below threshold or if no other layer remains
        if (val <= this.threshold || !this.next) {
            return this.profile.apply(val)
        } else {
            if (blendFlag) {
                // blend with next pass
                return this.blendWith(this.next)(input)

            } else {
                // override with next pass
                return this.next.eval(input)
            }
        }
    }

    eval(input: InputType) {
        let val = this.sampler.eval((input as Vector2))
        return this.profile.apply(val)
    }

}