import { Vector2, Vector3 } from 'three'

// import { MappingProfiles, ProfilePreset } from "../tools/MappingPresets"
import {
  BiomeConf,
  BiomeMappings,
  MappingData,
  MappingRanges,
} from '../common/types'
import { LinkedList } from '../common/misc'
import { MappingRangeSorter } from '../common/utils'
import * as Utils from '../common/utils'

import { ProcLayer } from './ProcLayer'

export enum BlockType {
  NONE,
  WATER,
  ICE,
  TREE_TRUNK,
  TREE_FOLIAGE,
  TREE_FOLIAGE_2,
  SAND,
  GRASS,
  MUD,
  ROCK,
  SNOW,
  DBG_LIGHT,
  DBG_DARK,
  DBG_PURPLE,
  DBG_ORANGE,
  DBG_GREEN,
}

export enum BiomeType {
  Temperate = 'temperate',
  Artic = 'artic',
  Desert = 'desert',
  // Tropical = 'tropical',
}

enum Heat {
  Cold = 'cold',
  Temperate = 'temperate',
  Hot = 'hot',
}

enum Rain {
  Dry = 'dry',
  Moderate = 'moderate',
  Wet = 'wet',
}

type HeatContribs = Record<Heat, number>
type RainContribs = Record<Rain, number>
export type BiomeInfluence = Record<BiomeType, number>

const BiomesMapping: Record<Heat, Record<Rain, BiomeType>> = {
  [Heat.Cold]: {
    [Rain.Dry]: BiomeType.Artic,
    [Rain.Moderate]: BiomeType.Artic,
    [Rain.Wet]: BiomeType.Artic,
  },
  [Heat.Temperate]: {
    [Rain.Dry]: BiomeType.Temperate, // TODO
    [Rain.Moderate]: BiomeType.Temperate,
    [Rain.Wet]: BiomeType.Temperate, // TODO
  },
  [Heat.Hot]: {
    [Rain.Dry]: BiomeType.Desert,
    [Rain.Moderate]: BiomeType.Desert,
    [Rain.Wet]: BiomeType.Desert, // TODO BiomeType.Tropical,
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

  mappings = {} as BiomeMappings
  posRandomizer: ProcLayer
  transitionLevels = {
    low: 0.3,
    mid_low: 0.4,
    mid: 0.5,
    mid_high: 0.6,
    high: 0.7,
  }

  params = {
    seaLevel: 0,
  }

  constructor(biomeConf?: BiomeConf) {
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
    if (biomeConf) this.setMappings(biomeConf)
  }

  static get instance() {
    Biome.singleton = Biome.singleton || new Biome()
    return Biome.singleton
  }

  /**
   *
   * @param input either blocks position, or pre-requested biome contributions
   * @returns
   */
  getMainBiome(input: Vector3 | BiomeInfluence): BiomeType {
    const biomeContribs =
      input instanceof Vector3 ? this.getBiomeInfluence(input) : input
    const mainBiome = Object.entries(biomeContribs).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0]
    return mainBiome as BiomeType
  }

  getBiomeInfluence(pos: Vector3): BiomeInfluence {
    const heatContribs: HeatContribs = {
      [Heat.Cold]: 0,
      [Heat.Temperate]: 0,
      [Heat.Hot]: 0,
    }
    const rainContribs: RainContribs = {
      [Rain.Dry]: 0,
      [Rain.Moderate]: 0,
      [Rain.Wet]: 0,
    }
    const biomeContribs: BiomeInfluence = {
      [BiomeType.Temperate]: 0,
      [BiomeType.Artic]: 0,
      [BiomeType.Desert]: 0,
    }
    const { transitionLevels } = this
    const heatVal = this.heatmap.eval(pos) // Utils.roundToDec(this.heatmap.eval(pos), 2)
    const rainVal = this.rainmap.eval(pos) // Utils.roundToDec(this.rainmap.eval(pos), 2)

    // TEMPERATURE
    // cold
    if (heatVal <= transitionLevels.low) {
      heatContribs.cold = 1
    }
    // cold to temperate transition
    else if (heatVal <= transitionLevels.mid_low) {
      heatContribs.temperate =
        (heatVal - transitionLevels.low) /
        (transitionLevels.mid_low - transitionLevels.low)
      heatContribs.cold = 1 - heatContribs.temperate
    }
    // temperate
    else if (heatVal <= transitionLevels.mid_high) {
      heatContribs.temperate = 1
    }
    // temperate to hot transition
    else if (heatVal <= transitionLevels.high) {
      heatContribs.hot =
        (heatVal - transitionLevels.mid_high) /
        (transitionLevels.high - transitionLevels.mid_high)
      heatContribs.temperate = 1 - heatContribs.hot
    }
    // hot
    else {
      heatContribs.hot = 1
    }

    // HUMIDITY
    // dry
    if (rainVal <= transitionLevels.low) {
      rainContribs.dry = 1
    }
    // dry => moderate transition
    else if (rainVal <= transitionLevels.mid_low) {
      rainContribs.moderate =
        (rainVal - transitionLevels.low) /
        (transitionLevels.mid_low - transitionLevels.low)
      rainContribs.dry = 1 - rainContribs.moderate
    }
    // moderate
    else if (rainVal <= transitionLevels.mid_high) {
      rainContribs.moderate = 1
    }
    // moderate to wet transition
    else if (rainVal <= transitionLevels.high) {
      rainContribs.wet =
        (rainVal - transitionLevels.mid_high) /
        (transitionLevels.high - transitionLevels.mid_high)
      rainContribs.moderate = 1 - rainContribs.wet
    }
    // wet
    else {
      rainContribs.wet = 1
    }

    Object.entries(heatContribs).forEach(([k1, v1]) => {
      Object.entries(rainContribs).forEach(([k2, v2]) => {
        const biomeType = BiomesMapping[k1 as Heat][k2 as Rain]
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

  setMappings(biomeConf: BiomeConf) {
    Object.entries(biomeConf).forEach(([biomeType, mappingConf]) => {
      const mappingItems = Object.values(mappingConf)
      const mappingRanges = LinkedList.fromArrayAfterSorting(
        mappingItems,
        MappingRangeSorter,
      )
      this.mappings[biomeType as BiomeType] = mappingRanges
    })
  }

  stepTransition = (
    groundPos: Vector2,
    baseHeight: number,
    blockMapping: MappingRanges,
  ) => {
    const period = 0.005 * Math.pow(2, 2)
    const mapCoords = groundPos.clone().multiplyScalar(period)
    const posRandomizerVal = this.posRandomizer.eval(mapCoords)
    // add some height variations to break painting monotony
    const { amplitude }: any = blockMapping.data
    const bounds = {
      lower: blockMapping.data.x,
      upper: blockMapping.next?.data.x || 1,
    }
    let blockTypes
    // randomize on lower side
    if (
      blockMapping.prev &&
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - amplitude.low < bounds.lower
    ) {
      const heightVariation = posRandomizerVal * amplitude.low
      const varyingHeight = baseHeight - heightVariation
      blockTypes =
        varyingHeight < blockMapping.data.x
          ? blockMapping.prev?.data.grounds
          : blockMapping.data.grounds
    }
    // randomize on upper side
    else if (blockMapping.next && baseHeight + amplitude.high > bounds.upper) {
      //   let heightVariation =
      //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
      // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
      const heightVariation = posRandomizerVal * amplitude.high
      const varyingHeight = baseHeight + heightVariation
      blockTypes =
        varyingHeight > blockMapping.next.data.x
          ? blockMapping.next.data.grounds
          : blockMapping.data.grounds
    }
    return blockTypes?.[0]
  }

  getBlockLevel = (
    rawVal: number,
    biomeType: BiomeType,
    includeSea = false,
  ) => {
    const { seaLevel } = this.params
    rawVal = includeSea ? Math.max(rawVal, seaLevel) : rawVal
    const validInput = Utils.clamp(rawVal, 0, 1)
    const mappingRange = Utils.findMatchingRange(
      rawVal,
      this.mappings[biomeType],
    )
    const upperRange = mappingRange.next || mappingRange
    const min = new Vector2(mappingRange.data.x, mappingRange.data.y)
    const max = new Vector2(upperRange.data.x, upperRange.data.y)
    const interpolated = Utils.interpolatePoints(min, max, validInput)
    return interpolated // includeSea ? Math.max(interpolated, seaLevel) : interpolated
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

  getBlockType = (rawVal: number, biomeType: BiomeType) => {
    // nominal block type
    let mappingRange = Utils.findMatchingRange(
      rawVal as number,
      this.mappings[biomeType as BiomeType],
    )
    while (!mappingRange.data.grounds && mappingRange.prev) {
      mappingRange = mappingRange.prev
    }

    // const finalBlockType = this.blockRandomization(groundPos, baseHeight, currentBlockMap)
    // if (finalBlockType !== nominalBlockType) console.log(`[getBlockType] nominal${nominalBlockType} random${finalBlock}`)
    return mappingRange.data as MappingData
  }
}
