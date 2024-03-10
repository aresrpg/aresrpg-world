import { Vector2, Vector3 } from 'three'
/**
 * Procedural Generation Layer 
 */
export class GenerationLayer { 
    static blendmap: GenerationLayer
    sampler
    profile
    threshold: number
    nextPass: GenerationLayer | undefined // if using linked pass

    /**
      * blend 2 layers according to blending layer at point eval
      * @param layers 
      * @param evalPoint 
      */
    static blendLayers(layer1: GenerationLayer, layer2: GenerationLayer, input: Vector2 | Vector3) {
        const eval1 = layer1.eval(input);
        const eval2 = layer2.eval(input);
        const blendingFactor = GenerationLayer.blendmap.eval(input);
        const blendEval = eval1 * (blendingFactor) + eval2 * (1 - blendingFactor)
        return blendEval
    }

    /**
   * required:
   * - sampler + height profile
   * - threshold: for next pass
   */
    constructor(sampler, profile, threshold) {
        this.sampler = sampler
        this.profile = profile
        this.threshold = threshold
    }

    /**
     * Iterate over layers based on threshold value:
     * - appply current pass if below treshold
     * - run next pass if above threshold and noise is null
     * @param order pass order
     * @returns 
     */
    chainEval(input: Vector2 | Vector3, noblend = false) {
        let val = this.sampler.query(input)
        // apply current if value below threshold or all other noises are null
        if (val > this.threshold && this.nextPass) {
            if (noblend) {
                // const nextPassVal = this.nextPass.sampler.query(input) 
                // if(nextPassEval> 0.1)
                return this.nextPass.eval(input)
            } else {
                // blend current and next pass together
                return GenerationLayer.blendLayers(this, this.nextPass, input)
            }

        } else {
            return this.profile.apply(val)
        }
    }

    eval(input: Vector2 | Vector3) {
        let val = this.sampler.query(input)
        return this.profile.apply(val)
    }

}