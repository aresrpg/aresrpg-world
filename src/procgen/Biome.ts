import { Vector2, Vector3 } from 'three'
// import { MappingProfiles, ProfilePreset } from "../tools/MappingPresets"
import { smoothstep } from 'three/src/math/MathUtils'

import { LinkedList } from '../common/misc'
import { MappingRangeSorter } from '../common/utils'
import * as Utils from '../common/utils'
import {
  BiomeLandscapeKey,
  BiomesConf,
  BiomesRawConf,
  LandscapeFields,
  LandscapesConf,
} from '../common/types'

import { ProcLayer } from './ProcLayer'

// reserved native block types
export enum BlockType {
  NONE,
  MUD,
  TRUNK,
  FOLIAGE_LIGHT,
  FOLIAGE_DARK,
  HOLE,
  LAST_PLACEHOLDER,
}

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
  Artic = 'artic',
  Desert = 'desert',
  // Tropical = 'tropical',
}

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
    [RainLevel.DRY]: BiomeType.Artic,
    [RainLevel.MODERATE]: BiomeType.Artic,
    [RainLevel.WET]: BiomeType.Artic,
  },
  [HeatLevel.TEMPERATE]: {
    [RainLevel.DRY]: BiomeType.Temperate, // TODO
    [RainLevel.MODERATE]: BiomeType.Temperate,
    [RainLevel.WET]: BiomeType.Temperate, // TODO
  },
  [HeatLevel.HOT]: {
    [RainLevel.DRY]: BiomeType.Desert,
    [RainLevel.MODERATE]: BiomeType.Desert,
    [RainLevel.WET]: BiomeType.Desert, // TODO BiomeType.Tropical,
  },
}

/**
 * assign block types: water, sand, grass, mud, rock, snow, ..
 */
export class Biome {
  // eslint-disable-next-line no-use-before-define
  static singleton: Biome

  heatmap: ProcLayer
  rainmap: ProcLayer
  // heatProfile: MappingRanges
  // rainProfile: MappingRanges

  mappings = {} as BiomesConf
  posRandomizer: ProcLayer
  /**
   * val < lowToMid=> LOW = 1
   * lowToMid < val < mid => LOW decrease, MID increase
   * mid < val < midToHigh => MID = 1
   * midToHigh < val < high => MID decrease, HIGH increase
   * val > hight => HIGH = 1
   */
  steps = {
    lowToMid: 0.3,
    mid: 0.4,
    midToHigh: 0.6,
    high: 0.7,
  }

  params = {
    seaLevel: 0,
  }

  indexedConf = new Map<BiomeLandscapeKey, LandscapesConf>()

  constructor(biomeRawConf?: BiomesRawConf) {
    this.heatmap = new ProcLayer('heatmap')
    this.heatmap.sampling.harmonicsCount = 6
    this.heatmap.sampling.periodicity = 8
    this.rainmap = new ProcLayer('rainmap')
    this.rainmap.sampling.harmonicsCount = 6
    this.rainmap.sampling.periodicity = 8
    // const mappingProfile = MappingProfiles[ProfilePreset.Stairs2]()
    // this.heatProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter)  // 3 levels (COLD, TEMPERATE, HOT)
    // this.rainProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter) // 3 levels (DRY, MODERATE, WET)
    this.posRandomizer = new ProcLayer('pos_random')
    this.posRandomizer.sampling.periodicity = 6
    if (biomeRawConf) this.parseBiomesConfig(biomeRawConf)
  }

  static get instance() {
    Biome.singleton = Biome.singleton || new Biome()
    return Biome.singleton
  }

  getConfIndex(confKey: BiomeLandscapeKey) {
    const confKeys = [...this.indexedConf.keys()] // Spread keys into an array
    const confIndex = confKeys.indexOf(confKey) // Find the index of 'key2'
    return confIndex
  }

  /**
   *
   * @param input either blocks position, or pre-requested biome contributions
   * @returns
   */
  getBiomeType(input: Vector3 | BiomeInfluence) {
    const biomeContribs =
      input instanceof Vector3 ? this.getBiomeInfluence(input) : input
    const mainBiome = Object.entries(biomeContribs).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as string
    return mainBiome as BiomeType
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
      const interp = smoothstep(value, steps.lowToMid, steps.mid)
      contributions.low = 1 - interp
      contributions.mid = interp
    }
    // MID
    else if (value < steps.midToHigh) {
      contributions.mid = 1
    }
    // dec MID/ inc HIGH
    else if (value < steps.high) {
      const interp = smoothstep(value, steps.midToHigh, steps.high)
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

  getBiomeInfluence(pos: Vector2 | Vector3): BiomeInfluence {
    const biomeContribs: BiomeInfluence = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
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
        (biomeContribs[k as BiomeType] = Utils.roundToDec(
          biomeContribs[k as BiomeType],
          2,
        )),
    )

    // biomeContribs[BiomeType.Artic] = 1
    // biomeContribs[BiomeType.Desert] = 0
    // biomeContribs[BiomeType.Temperate] = 0
    return biomeContribs
  }

  parseBiomesConfig(biomesRawConf: BiomesRawConf) {
    // Object.entries(biomeConfigs).forEach(([biomeType, biomeConf]) => {
    // complete missing data
    for (const [biomeType, biomeConf] of Object.entries(biomesRawConf)) {
      for (const [landId, landConf] of Object.entries(biomeConf)) {
        landConf.key = biomeType + '_' + landId
      }

      const configItems = Object.values(biomeConf) as LandscapeFields[]
      const mappingRanges = LinkedList.fromArrayAfterSorting(
        configItems,
        MappingRangeSorter,
      )
      this.mappings[biomeType as BiomeType] = mappingRanges
      // index configs
      const confIter = mappingRanges.first().forwardIter()
      for (const conf of confIter) {
        this.indexedConf.set(conf.data.key, conf)
      }
    }
    // })
  }

  landscapeTransition = (
    groundPos: Vector2,
    baseHeight: number,
    landscapeConf: LandscapesConf,
  ) => {
    const period = 0.005 * Math.pow(2, 2)
    const mapCoords = groundPos.clone().multiplyScalar(period)
    const posRandomizerVal = this.posRandomizer.eval(mapCoords)
    // add some height variations to break painting monotony
    const { amplitude }: any = landscapeConf.data
    const bounds = {
      lower: landscapeConf.data.x,
      upper: landscapeConf.next?.data.x || 1,
    }
    let blockType
    // randomize on lower side
    if (
      landscapeConf.prev &&
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - amplitude.low < bounds.lower
    ) {
      const heightVariation = posRandomizerVal * amplitude.low
      const varyingHeight = baseHeight - heightVariation
      blockType =
        varyingHeight < landscapeConf.data.x
          ? landscapeConf.prev?.data.type
          : landscapeConf.data.type
    }
    // randomize on upper side
    else if (landscapeConf.next && baseHeight + amplitude.high > bounds.upper) {
      //   let heightVariation =
      //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
      // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
      const heightVariation = posRandomizerVal * amplitude.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > landscapeConf.next.data.x
          ? landscapeConf.next.data.type
          : landscapeConf.data.type
    }
    return blockType
  }

  getBlockLevel = (
    rawVal: number,
    biomeType: BiomeType,
    includeSea = false,
  ) => {
    const { seaLevel } = this.params
    rawVal = includeSea ? Math.max(rawVal, seaLevel) : rawVal
    rawVal = Utils.clamp(rawVal, 0, 1)
    const biomeConf = this.mappings[biomeType]
    const current = Utils.findMatchingRange(rawVal, biomeConf)
    const upper = current?.next || current
    const min = new Vector2(current.data.x, current.data.y)
    const max = new Vector2(upper.data.x, upper.data.y)
    const lerp = min.lerp(max, (rawVal - min.x) / (max.x - min.x))
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

  getBiomeConf = (rawVal: number, biomeType: BiomeType) => {
    const firstItem = this.mappings[biomeType]
    let currentItem = Utils.findMatchingRange(rawVal as number, firstItem)

    while (!currentItem?.data.type && currentItem?.prev) {
      currentItem = currentItem.prev
    }
    return currentItem
  }
}
