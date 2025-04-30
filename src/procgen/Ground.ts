import { Vector2 } from 'three'

import { getWorldSeed, GroundEnvSettings, WorldSeed, WorldSeeds } from '../config/WorldEnv.js'
import { BiomeLands, BiomesConf, BiomeType } from '../utils/common_types.js'
import { clamp } from '../utils/math_utils.js'

import { Biome, BiomeInfluence } from './Biome.js'
import { BlendMode, getCompositor } from './NoiseComposition.js'
import { Noise2dSampler } from './NoiseSampler.js'

const MODULATION_THRESHOLD = 0.318

/**
 * # HeightMaps
 * - `Heightmap`: terrain elevation with threshold for ocean, beach, riff, lands, mountains ..
 *  Specifies overall terrain shape and how far inland.
 * - `Amplitude` modulation (or erosion)
 * modulating terrain amplitude, to produce variants like flat, hilly lands, ..
 * - (TODO): higher density noise to make rougher terrain with quick variation
 *
 */

export class Ground {
    parent: any
    compositor = getCompositor(BlendMode.MUL)
    // maps (externally provided)
    heightmap: Noise2dSampler
    amplitude: Noise2dSampler
    transition: Noise2dSampler // variations
    biome: Biome
    biomes: BiomesConf
    seaLevel: number

    constructor(biome: Biome, biomes: BiomesConf, envSettings: GroundEnvSettings, worldSeeds: WorldSeeds) {
        this.heightmap = new Noise2dSampler(WorldSeed.Heatmap, getWorldSeed(worldSeeds, WorldSeed.Ground))
        this.heightmap.params.spreading = envSettings.spreading
        this.heightmap.harmonicsCount = envSettings.harmonics
        this.amplitude = new Noise2dSampler(WorldSeed.Amplitude, getWorldSeed(worldSeeds, WorldSeed.Amplitude))
        this.transition = new Noise2dSampler('land_transition')
        this.transition.periodicity = 6
        this.biome = biome
        this.biomes = biomes
        this.seaLevel = envSettings.seaLevel
    }

    private applyModulation(input: Vector2, initialVal: number, threshold: number) {
        let finalVal = initialVal
        const aboveThreshold = initialVal - threshold // rawVal - threshold
        // modulates height after threshold according to amplitude layer
        if (aboveThreshold > 0) {
            const modulation = this.amplitude.eval(input)
            const blendingWeight = 3
            // blendingWeight /= (threshold + modulatedVal) > 0.8 ? 1.2 : 1
            const modulatedVal = this.compositor(aboveThreshold, modulation, blendingWeight)
            finalVal = threshold + modulatedVal
        }
        return finalVal
    }

    getRawVal(blockPos: Vector2) {
        return this.heightmap.eval(blockPos)
    }

    private getRawHeight(rawVal: number, biomeType: BiomeType, includeSea = false) {
        const { seaLevel } = this
        rawVal = includeSea ? Math.max(rawVal, seaLevel) : rawVal
        rawVal = clamp(rawVal, 0, 1)
        const biomeLand = this.getBiomeLand(biomeType, rawVal, false)
        const nextBiomeLand = biomeLand?.next || biomeLand
        const min = new Vector2(biomeLand.data.threshold, biomeLand.data.elevation)
        const max = new Vector2(nextBiomeLand.data.threshold, nextBiomeLand.data.elevation)
        const alpha = max.x > min.x ? (rawVal - min.x) / (max.x - min.x) : 0
        const lerp = min.lerp(max, alpha)
        return lerp.y // includeSea ? Math.max(interpolated, seaLevel) : interpolated
    }

    /**
     *
     * @param blockPos
     * @param rawVal
     * @param biomeInfluence
     * @returns
     */
    getGroundLevel(
        blockPos: Vector2,
        rawVal?: number,
        biomeInfluence?: BiomeInfluence,
        // includeSea?: boolean,
    ) {
        rawVal = rawVal || this.getRawVal(blockPos)
        biomeInfluence = biomeInfluence || this.biome.getBiomeInfluence(blockPos)
        // (blockData as BlockIterData).cache.type = Biome.instance.getBlockType(blockPos, noiseVal)
        // noiseVal = includeSea ? Math.max(noiseVal, Biome.instance.params.seaLevel) : noiseVal
        // sum weighted contributions from all biome types
        const interpolatedHeight = Object.entries(biomeInfluence).reduce(
            (res, [biome, weight]) => res + weight * this.getRawHeight(rawVal, biome as BiomeType),
            0,
        )
        // const initialVal = Biome.instance.getBlockLevel(rawVal, Biome.instance.getBiomeType(biomeInfluence))
        const finalVal = this.applyModulation(blockPos, interpolatedHeight, MODULATION_THRESHOLD)
        // blockPos.y = Math.floor(finalVal * 255)
        return Math.floor(finalVal * 255)
    }

    getBiomeLand(biomeType: BiomeType, rawVal: number, fullConf = true) {
        const biomeLands = this.biomes[biomeType]
        let biomeLand = biomeLands.findMatchingElement(rawVal)
        if (fullConf) {
            // skip any partial conf until full is found
            while (!biomeLand?.data.type && biomeLand?.prev) {
                biomeLand = biomeLand.prev
            }
        }
        return biomeLand as BiomeLands
    }
}
