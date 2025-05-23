import { Vector2, Vector2Like } from 'three'

// import { MappingProfiles, ProfilePreset } from "../tools/MappingPresets"
// import {  smoothstep as smoothStep } from 'three/src/math/MathUtils'
import { BiomeType } from '../utils/common_types.js'
import { roundToDec, smoothStep } from '../utils/math_utils.js'
import { isVect2Stub } from '../utils/patch_chunk.js'
import { BiomesEnvSettings, getWorldSeed, WorldSeed, WorldSeeds } from '../config/WorldEnv.js'

import { Noise2dSampler } from './NoiseSampler.js'

enum Level {
    LOW = 'low',
    MID = 'mid',
    HIGH = 'high',
}

enum HeatLevel {
    COLD = 'cold',
    TEMPERATE = 'temperate',
    HOT = 'hot',
}

enum RainLevel {
    DRY = 'dry',
    MODERATE = 'mod',
    WET = 'wet',
}

const heatLevelMappings: Record<Level, HeatLevel> = {
    [Level.LOW]: HeatLevel.COLD,
    [Level.MID]: HeatLevel.TEMPERATE,
    [Level.HIGH]: HeatLevel.HOT,
}

const rainLevelMappings: Record<Level, RainLevel> = {
    [Level.LOW]: RainLevel.DRY,
    [Level.MID]: RainLevel.MODERATE,
    [Level.HIGH]: RainLevel.WET,
}

type Contribution = Record<Level, number>

const translateContribution = <T extends HeatLevel | RainLevel>(contribution: Contribution, keyMapping: Record<Level, T>) => {
    const mappedContribution: Record<T, number> = {} as Record<T, number>
    Object.entries(contribution).forEach(([key, val]) => {
        const targetKey = keyMapping[key as Level] as T
        mappedContribution[targetKey] = val
        return mappedContribution
    })
    return mappedContribution
}

export type BiomeInfluence = Record<BiomeType, number>

const BiomesMapping: Record<HeatLevel, Record<RainLevel, BiomeType>> = {
    [HeatLevel.COLD]: {
        [RainLevel.DRY]: BiomeType.Taiga,
        [RainLevel.MODERATE]: BiomeType.Glacier,
        [RainLevel.WET]: BiomeType.Arctic,
    },
    [HeatLevel.TEMPERATE]: {
        [RainLevel.DRY]: BiomeType.Grassland,
        [RainLevel.MODERATE]: BiomeType.Temperate,
        [RainLevel.WET]: BiomeType.Swamp,
    },
    [HeatLevel.HOT]: {
        [RainLevel.DRY]: BiomeType.Scorched,
        [RainLevel.MODERATE]: BiomeType.Desert,
        [RainLevel.WET]: BiomeType.Tropical,
    },
}

/**
 *  FIRST SEGMENT | TRANSIT | CENTRAL SEGMENT | TRANSIT | LAST SEGMENT
 * 0             0.3
 * @returns
 */
const getTransitionSteps = (biomesRepartition: any) => {
    const { transitionHalfRange, centralHalfSegment } = biomesRepartition

    const firstSegmentEnd = 0.5 - centralHalfSegment - transitionHalfRange
    const lastSegmentStart = 0.5 + centralHalfSegment + transitionHalfRange
    const centralSegmentStart = 0.5 - centralHalfSegment + transitionHalfRange
    const centralSegmentEnd = 0.5 + centralHalfSegment - transitionHalfRange

    const transitionSteps = {
        lowToMid: roundToDec(firstSegmentEnd, 2),
        mid: roundToDec(centralSegmentStart, 2),
        midToHigh: roundToDec(centralSegmentEnd, 2),
        high: roundToDec(lastSegmentStart, 2),
    }

    // console.log(`biome repartition level segments settings: `, transitionSteps)
    return transitionSteps
}

/**
 * assign block types: water, sand, grass, mud, rock, snow, ..
 */
export class Biome {
    heatmap: Noise2dSampler
    rainmap: Noise2dSampler
    // heatProfile: MappingRanges
    // rainProfile: MappingRanges
    /**
     * val < lowToMid=> LOW = 1
     * lowToMid < val < mid => LOW decrease, MID increase
     * mid < val < midToHigh => MID = 1
     * midToHigh < val < high => MID decrease, HIGH increase
     * val > hight => HIGH = 1
     */
    steps
    biomeEnv: BiomesEnvSettings

    constructor(biomeEnv: BiomesEnvSettings, worldSeeds: WorldSeeds) {
        this.heatmap = new Noise2dSampler(WorldSeed.Heatmap, getWorldSeed(worldSeeds, WorldSeed.Heatmap))
        this.heatmap.harmonicsCount = 6
        this.heatmap.periodicity = biomeEnv.periodicity
        this.rainmap = new Noise2dSampler(WorldSeed.Rainmap, getWorldSeed(worldSeeds, WorldSeed.Rainmap))
        this.rainmap.harmonicsCount = 6
        this.rainmap.periodicity = biomeEnv.periodicity
        // const mappingProfile = MappingProfiles[ProfilePreset.Stairs2]()
        // this.heatProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter)  // 3 levels (COLD, TEMPERATE, HOT)
        // this.rainProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter) // 3 levels (DRY, MODERATE, WET)
        this.steps = getTransitionSteps(biomeEnv.repartition)
        this.biomeEnv = biomeEnv
    }

    /**
     *
     * @param input either blocks position, or pre-requested biome contributions
     * @returns
     */
    getBiomeType(input: Vector2 | BiomeInfluence) {
        const biomeContribs = isVect2Stub(input as Vector2Like) ? this.getBiomeInfluence(input as Vector2) : input
        const dominantBiome = Object.entries(biomeContribs).sort((a, b) => b[1] - a[1])[0]?.[0] as string
        return dominantBiome as BiomeType
    }

    calculateContributions(value: number) {
        const { steps } = this

        const contributions = {
            low: 0,
            mid: 0,
            high: 0,
        }

        // LOW
        if (value < steps.lowToMid) {
            contributions.low = 1
        }
        // dec LOW, inc MID
        else if (value < steps.mid) {
            const interp = smoothStep(value, steps.lowToMid, steps.mid)
            contributions.low = 1 - interp
            contributions.mid = interp
        }
        // MID
        else if (value < steps.midToHigh) {
            contributions.mid = 1
        }
        // dec MID/ inc HIGH
        else if (value < steps.high) {
            const interp = smoothStep(value, steps.midToHigh, steps.high)
            contributions.mid = 1 - interp
            contributions.high = interp
        }
        // HIGH
        else {
            contributions.high = 1
        }

        // if (value < 0.5) {
        //   const level = smoothstep(value, steps.lowToMid, steps.mid)
        //   contributions.low = 1 - level
        //   contributions.mid = level
        // } else {
        //   const heatLevel = smoothstep(value, steps.midToHigh, steps.high)
        //   contributions.mid = 1 - heatLevel
        //   contributions.high = heatLevel
        // }

        return contributions
    }

    getBiomeInfluence(pos: Vector2): BiomeInfluence {
        const biomeContribs: BiomeInfluence = {
            [BiomeType.Temperate]: 0,
            [BiomeType.Arctic]: 0,
            [BiomeType.Desert]: 0,
            [BiomeType.Tropical]: 0,
            [BiomeType.Scorched]: 0,
            [BiomeType.Swamp]: 0,
            [BiomeType.Glacier]: 0,
            [BiomeType.Taiga]: 0,
            [BiomeType.Grassland]: 0,
        }

        const heatVal = this.heatmap.eval(pos) // Utils.roundToDec(this.heatmap.eval(pos), 2)
        const rainVal = this.rainmap.eval(pos) // Utils.roundToDec(this.rainmap.eval(pos), 2)
        let contrib = this.calculateContributions(heatVal)
        const heatContributions = translateContribution(contrib, heatLevelMappings)
        contrib = this.calculateContributions(rainVal)
        const rainContributions = translateContribution(contrib, rainLevelMappings)

        Object.entries(heatContributions).forEach(([k1, v1]) => {
            Object.entries(rainContributions).forEach(([k2, v2]) => {
                const biomeType = BiomesMapping[k1 as HeatLevel][k2 as RainLevel]
                biomeContribs[biomeType] += v1 * v2
            })
        })
        Object.keys(biomeContribs).forEach(k => (biomeContribs[k as BiomeType] = roundToDec(biomeContribs[k as BiomeType], 2)))

        // biomeContribs[BiomeType.Arctic] = 1
        // biomeContribs[BiomeType.Desert] = 0
        // biomeContribs[BiomeType.Temperate] = 0
        return biomeContribs
    }

    // landscapeTransition = (groundPos: Vector2, baseHeight: number, biomeLands: BiomeLands) => {
    //     const period = 0.005 * Math.pow(2, 2)
    //     const mapCoords = groundPos.clone().multiplyScalar(period)
    //     const posRandomizerVal = this.posRandomizer.eval(mapCoords)
    //     // add some height variations to break painting monotony
    //     const { amplitude }: any = biomeLands.data
    //     const bounds = {
    //         lower: biomeLands.data.threshold,
    //         upper: biomeLands.next?.data.threshold || 1,
    //     }
    //     let blockType
    //     // randomize on lower side
    //     if (biomeLands.prev && baseHeight - bounds.lower <= bounds.upper - baseHeight && baseHeight - amplitude.low < bounds.lower) {
    //         const heightVariation = posRandomizerVal * amplitude.low
    //         const varyingHeight = baseHeight - heightVariation
    //         blockType = varyingHeight < biomeLands.data.threshold ? biomeLands.prev?.data.type : biomeLands.data.type
    //     }
    //     // randomize on upper side
    //     else if (biomeLands.next && baseHeight + amplitude.high > bounds.upper) {
    //         //   let heightVariation =
    //         //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
    //         // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
    //         const heightVariation = posRandomizerVal * amplitude.high
    //         const varyingHeight = baseHeight + heightVariation
    //         blockType = varyingHeight > biomeLands.next.data.threshold ? biomeLands.next.data.type : biomeLands.data.type
    //     }
    //     return blockType
    // }
}
