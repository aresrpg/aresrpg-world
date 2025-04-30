import { createNoise2D, createNoise3D } from 'simplex-noise'
import { Vector2, Vector3 } from 'three'
import Alea from '../libs/alea.js'
import { clamp } from '../utils/math_utils.js'

export type InputType = Vector2 | Vector3
export type Generator = (input: InputType) => number

type Harmonic = {
    period: number
    amplitude: number
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
    scaling: number
    spreading: number
}

export abstract class NoiseSampler<PosInput extends Vector2 | Vector3> {
    // eslint-disable-next-line no-use-before-define
    static instances: NoiseSampler<any>[] = []
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
        spreading: 0,
        scaling: 0.001,
    }

    shadowParams = {}
    stats = {}
    parent: any

    constructor(name = '', seed?: string, ) {
        this.params.seed = seed || name
        this.initNoiseSource()
        this.init()
        NoiseSampler.instances.push(this)
        // console.log(`noise sampler ${name}: ${this.params.seed}`)
    }

    abstract initNoiseSource(): void

    init() {
        const { harmonics } = this.params
        const periodicity = Math.pow(2, this.params.periodicity)
        this.harmonics = Array.from(new Array(harmonics.count)).map((_v, i) => {
            // this.stats['h' + i] = { min: 1, max: 0 }
            const period = periodicity / Math.pow(harmonics.spread, i)
            const amplitude = Math.pow(harmonics.gain, i)
            return { period, amplitude }
        })
        this.harmonicsAmplitudeSum = this.harmonics.reduce((sum, harm) => sum + harm.amplitude, 0)
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

    rawEval(x: number, y: number, z?: number, t?: number): number {
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

    eval(rawInput: PosInput) {
        const { scaling } = this.params
        const { x, y } = rawInput
        const noiseRawVal = this.rawEval(x * scaling, y * scaling)
        const noiseVal = (noiseRawVal - 0.5) * 2 ** this.params.spreading + 0.5
        // val = this.mapping.apply(val)
        return noiseVal
    }
}

export class Noise2dSampler extends NoiseSampler<Vector2> {
    override initNoiseSource(): void {
        // create a new random function based on the seed
        const prng = Alea(this.seed)
        this.noiseSource = createNoise2D(prng) // noiseConstructor[this.params.dimensions](prng)
    }

    override eval(rawInput: Vector2): number {
        const { scaling } = this.params
        const { x, y } = rawInput
        const noiseRawVal = this.rawEval(x * scaling, y * scaling)
        const noiseVal = (noiseRawVal - 0.5) * 2 ** this.params.spreading + 0.5
        // val = this.mapping.apply(val)
        return noiseVal
    }
}

export class Noise3dSampler extends NoiseSampler<Vector3> {
    override initNoiseSource(): void {
        // create a new random function based on the seed
        const prng = Alea(this.seed)
        this.noiseSource = createNoise3D(prng)
    }

    override eval(rawInput: Vector3): number {
        const { scaling } = this.params
        const { x, y, z } = rawInput
        const noiseRawVal = this.rawEval(x * scaling, y * scaling, z * scaling)
        const noiseVal = (noiseRawVal - 0.5) * 2 ** this.params.spreading + 0.5
        // val = this.mapping.apply(val)
        return noiseVal
    }
}

export class VolumetricDensity extends NoiseSampler<Vector3> {
    override initNoiseSource(): void {
        // create a new random function based on the seed
        const prng = Alea(this.seed)
        this.noiseSource = createNoise3D(prng)
    }

    params2 = {
        spreading: 0,
        scaling: 0.1,
    }

    constructor(seed: string) {
        super(seed, 'volumetricDensity')
        this.periodicity = 7
        this.harmonicsCount = 4
    }

    /**
     *
     * @param blockData
     * @param includeSea
     * @returns
     */
    getBlockDensity(
        blockPos: Vector3,
        threshold: number,
        // includeSea?: boolean,
    ) {
        const { scaling } = this.params2
        const { x, y, z } = blockPos.clone().multiplyScalar(scaling)
        const density = this.rawEval(x * scaling, y * scaling, z * scaling)
        return density < threshold
    }
}

export class CavernsVolumetricDensity extends VolumetricDensity {
    /**
     *
     * @param blockData
     * @param includeSea
     * @returns
     */
    override getBlockDensity(
        blockPos: Vector3,
        groundLevel = 512,
        // includeSea?: boolean,
    ) {
        // adaptative density threshold based on terrain height
        const threshold = Math.sin((blockPos.y / groundLevel) * Math.PI) * 0.5
        return super.getBlockDensity(blockPos, threshold)
    }
}

// export class VolumetricSpriteDistribution {

// }
