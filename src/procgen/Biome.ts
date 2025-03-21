import { Vector2, Vector3, Vector3Like } from 'three'

// import { MappingProfiles, ProfilePreset } from "../tools/MappingPresets"
// import {  smoothstep as smoothStep } from 'three/src/math/MathUtils'
import { LinkedList } from '../datacontainers/LinkedList.js'
import {
  BiomeLandKey,
  BiomesConf,
  BiomesRawConf,
  LandConfigFields,
  BiomeLands,
  ItemType,
} from '../utils/common_types.js'
import { clamp, roundToDec, smoothStep } from '../utils/math_utils.js'
import {
  findMatchingRange,
  MappingRangeSorter,
  typesNumbering,
} from '../utils/misc_utils.js'
import { asVect3, isVect3Stub } from '../utils/patch_chunk.js'
import {
  BiomesEnvSettings,
  getWorldSeed,
  WorldSeed,
  WorldSeeds,
} from '../config/WorldEnv.js'

import { NoiseSampler } from './NoiseSampler.js'

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

export enum BiomeType {
  Temperate = 'temperate',
  Arctic = 'arctic',
  Desert = 'desert',
  Tropical = 'tropical',
  Scorched = 'scorched',
  Swamp = 'swamp',
  Glacier = 'glacier',
  Taiga = 'taiga',
  Grassland = 'grassland',
}

export const BiomeNumericType: Record<BiomeType, number> = {
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

typesNumbering(BiomeNumericType)

export const ReverseBiomeNumericType: Record<number, BiomeType> = {}
Object.keys(BiomeNumericType).forEach(
  (type, i) => (ReverseBiomeNumericType[i] = type as BiomeType),
)

type Contribution = Record<Level, number>

const translateContribution = <T extends HeatLevel | RainLevel>(
  contribution: Contribution,
  keyMapping: Record<Level, T>,
) => {
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
 * weightedFloraTypes: weighted item types which are supposed to spawn
 * at given location
 */
const expandWeightedFloraTypes = (
  weightedFloraTypes: Record<ItemType, number>,
) => {
  const floraTypes: ItemType[] = []
  if (weightedFloraTypes) {
    Object.entries(weightedFloraTypes).forEach(([itemType, typeWeight]) => {
      while (typeWeight > 0) {
        floraTypes.push(itemType)
        typeWeight--
      }
    })
  }
  return floraTypes
}

type PreprocessedLandConf = {
  floraItems: ItemType[]
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
  heatmap: NoiseSampler
  rainmap: NoiseSampler
  // heatProfile: MappingRanges
  // rainProfile: MappingRanges

  mappings = {} as BiomesConf
  posRandomizer: NoiseSampler
  /**
   * val < lowToMid=> LOW = 1
   * lowToMid < val < mid => LOW decrease, MID increase
   * mid < val < midToHigh => MID = 1
   * midToHigh < val < high => MID decrease, HIGH increase
   * val > hight => HIGH = 1
   */
  steps
  preprocessed = new Map<BiomeLandKey, PreprocessedLandConf>()
  biomeEnv: BiomesEnvSettings

  constructor(biomeEnv: BiomesEnvSettings, worldSeeds: WorldSeeds) {
    this.heatmap = new NoiseSampler(
      getWorldSeed(worldSeeds, WorldSeed.Heatmap),
      WorldSeed.Heatmap,
    )
    this.heatmap.harmonicsCount = 6
    this.heatmap.periodicity = biomeEnv.periodicity
    this.rainmap = new NoiseSampler(
      getWorldSeed(worldSeeds, WorldSeed.Rainmap),
      WorldSeed.Rainmap,
    )
    this.rainmap.harmonicsCount = 6
    this.rainmap.periodicity = biomeEnv.periodicity
    // const mappingProfile = MappingProfiles[ProfilePreset.Stairs2]()
    // this.heatProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter)  // 3 levels (COLD, TEMPERATE, HOT)
    // this.rainProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter) // 3 levels (DRY, MODERATE, WET)
    this.posRandomizer = new NoiseSampler(
      getWorldSeed(worldSeeds, WorldSeed.RandomPos),
      WorldSeed.RandomPos,
    )
    this.posRandomizer.periodicity = 6
    this.parseBiomesConfig(biomeEnv.rawConf)

    this.steps = getTransitionSteps(biomeEnv.repartition)
    this.biomeEnv = biomeEnv
  }

  get ready() {
    return Object.keys(this.mappings).length > 0
  }

  /**
   *
   * @param input either blocks position, or pre-requested biome contributions
   * @returns
   */
  getBiomeType(input: Vector3 | BiomeInfluence) {
    const biomeContribs = isVect3Stub(input as Vector3Like)
      ? this.getBiomeInfluence(input as Vector3)
      : input
    const dominantBiome = Object.entries(biomeContribs).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as string
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

  getBiomeInfluence(pos: Vector3): BiomeInfluence {
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
    Object.keys(biomeContribs).forEach(
      k =>
        (biomeContribs[k as BiomeType] = roundToDec(
          biomeContribs[k as BiomeType],
          2,
        )),
    )

    // biomeContribs[BiomeType.Arctic] = 1
    // biomeContribs[BiomeType.Desert] = 0
    // biomeContribs[BiomeType.Temperate] = 0
    return biomeContribs
  }

  preprocessLandConfig(
    biomeType: BiomeType,
    biomeConfig: LinkedList<LandConfigFields>,
  ) {
    const configs = biomeConfig.first().forwardIter()
    for (const conf of configs) {
      const landConf = conf.data
      const confKey = biomeType + '_' + landConf.key
      // console.log(confKey)
      const floraItems = landConf.flora
        ? expandWeightedFloraTypes(landConf.flora)
        : []
      this.preprocessed.set(confKey, {
        floraItems,
      })
      // this.indexedConf.set(conf.data.key, conf)
    }
  }

  parseBiomesConfig(biomesRawConf: BiomesRawConf) {
    // complete missing data
    for (const [biomeType, biomeLands] of Object.entries(biomesRawConf)) {
      for (const [landId, landConf] of Object.entries(biomeLands)) {
        landConf.key = landId
      }
      const configItems = Object.values(biomeLands) as LandConfigFields[]
      const mappingRanges = LinkedList.fromArrayAfterSorting(
        configItems,
        MappingRangeSorter,
      )
      this.mappings[biomeType as BiomeType] = mappingRanges
      this.preprocessLandConfig(biomeType as BiomeType, mappingRanges)
    }
  }

  landscapeTransition = (
    groundPos: Vector2,
    baseHeight: number,
    biomeLands: BiomeLands,
  ) => {
    const period = 0.005 * Math.pow(2, 2)
    const mapCoords = groundPos.clone().multiplyScalar(period)
    const posRandomizerVal = this.posRandomizer.eval(asVect3(mapCoords))
    // add some height variations to break painting monotony
    const { amplitude }: any = biomeLands.data
    const bounds = {
      lower: biomeLands.data.x,
      upper: biomeLands.next?.data.x || 1,
    }
    let blockType
    // randomize on lower side
    if (
      biomeLands.prev &&
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - amplitude.low < bounds.lower
    ) {
      const heightVariation = posRandomizerVal * amplitude.low
      const varyingHeight = baseHeight - heightVariation
      blockType =
        varyingHeight < biomeLands.data.x
          ? biomeLands.prev?.data.type
          : biomeLands.data.type
    }
    // randomize on upper side
    else if (biomeLands.next && baseHeight + amplitude.high > bounds.upper) {
      //   let heightVariation =
      //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
      // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
      const heightVariation = posRandomizerVal * amplitude.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > biomeLands.next.data.x
          ? biomeLands.next.data.type
          : biomeLands.data.type
    }
    return blockType
  }

  getBlockLevel = (
    rawVal: number,
    biomeType: BiomeType,
    includeSea = false,
  ) => {
    const { seaLevel } = this.biomeEnv
    rawVal = includeSea ? Math.max(rawVal, seaLevel) : rawVal
    rawVal = clamp(rawVal, 0, 1)
    const firstItem = this.mappings[biomeType]
    const confId = findMatchingRange(rawVal as number, firstItem)
    const current = firstItem.nth(confId)
    const upper = current?.next || current
    const min = new Vector2(current.data.x, current.data.y)
    const max = new Vector2(upper.data.x, upper.data.y)
    const alpha = max.x > min.x ? (rawVal - min.x) / (max.x - min.x) : 0
    const lerp = min.lerp(max, alpha)
    return lerp.y // includeSea ? Math.max(interpolated, seaLevel) : interpolated
  }

  getBlockLevelInterpolated = (
    rawVal: number,
    biomeContribs: BiomeInfluence,
  ) => {
    // sum weighted contributions from all biome types
    const blockLevel = Object.entries(biomeContribs).reduce(
      (res, [biome, weight]) =>
        res + weight * this.getBlockLevel(rawVal, biome as BiomeType),
      0,
    )
    return blockLevel
  }

  getBiomeLandConf = (biomeType: BiomeType, landId: string) => {
    const confKey = biomeType + '_' + landId
    const biomeConf = this.preprocessed.get(confKey)
    return biomeConf
  }

  getBiomeConf = (rawVal: number, biomeType: BiomeType) => {
    const firstItem = this.mappings[biomeType]
    const confId = findMatchingRange(rawVal as number, firstItem)
    let currentItem = firstItem.nth(confId)
    while (!currentItem?.data.type && currentItem?.prev) {
      currentItem = currentItem.prev
    }
    return currentItem
  }
}
