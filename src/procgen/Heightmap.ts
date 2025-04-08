import { Vector3 } from 'three'

import { getWorldSeed, HeightmapEnvSettings, WorldSeed, WorldSeeds } from '../config/WorldEnv.js'

import { Biome, BiomeInfluence } from './Biome.js'
import { BlendMode, getCompositor } from './NoiseComposition.js'
import { NoiseSampler } from './NoiseSampler.js'

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

export class Heightmap {
    parent: any
    compositor = getCompositor(BlendMode.MUL)
    // maps (externally provided)
    heightmap: NoiseSampler
    amplitude: NoiseSampler
    biome: Biome

    constructor(biome: Biome, envSettings: HeightmapEnvSettings, worldSeeds: WorldSeeds) {
        this.heightmap = new NoiseSampler(getWorldSeed(worldSeeds, WorldSeed.Heightmap), WorldSeed.Heatmap)
        this.heightmap.params.spreading = envSettings.spreading
        this.heightmap.harmonicsCount = envSettings.harmonics
        this.amplitude = new NoiseSampler(getWorldSeed(worldSeeds, WorldSeed.Amplitude), WorldSeed.Amplitude)
        this.biome = biome
    }

    applyModulation(input: Vector3, initialVal: number, threshold: number) {
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

    getRawVal(blockPos: Vector3) {
        return this.heightmap.eval(blockPos)
    }

    /**
     *
     * @param blockData
     * @param includeSea
     * @returns
     */
    getGroundLevel(
        blockPos: Vector3,
        rawVal?: number,
        biomeInfluence?: BiomeInfluence,
        // includeSea?: boolean,
    ) {
        rawVal = rawVal || this.getRawVal(blockPos)
        biomeInfluence = biomeInfluence || this.biome.getBiomeInfluence(blockPos)
        // (blockData as BlockIterData).cache.type = Biome.instance.getBlockType(blockPos, noiseVal)
        // noiseVal = includeSea ? Math.max(noiseVal, Biome.instance.params.seaLevel) : noiseVal
        const initialVal = this.biome.getBlockLevelInterpolated(rawVal, biomeInfluence)
        // const initialVal = Biome.instance.getBlockLevel(rawVal, Biome.instance.getBiomeType(biomeInfluence))
        const finalVal = this.applyModulation(blockPos, initialVal, MODULATION_THRESHOLD)
        // blockPos.y = Math.floor(finalVal * 255)
        return Math.floor(finalVal * 255)
    }
}
