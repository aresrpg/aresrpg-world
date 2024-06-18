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
  paintRandomness: ProcLayer

  params = {
    seaLevel: 0,
  }

  constructor(biomeConf?: BiomeConf) {
    this.heatmap = new ProcLayer('heatmap')
    this.heatmap.sampling.harmonicsCount = 1
    this.heatmap.sampling.periodicity = 8
    this.rainmap = new ProcLayer('rainmap')
    this.rainmap.sampling.harmonicsCount = 1
    this.rainmap.sampling.periodicity = 8
    // const mappingProfile = MappingProfiles[ProfilePreset.Stairs2]()
    // this.heatProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter)  // 3 levels (COLD, TEMPERATE, HOT)
    // this.rainProfile = LinkedList.fromArrayAfterSorting(mappingProfile, MappingRangeSorter) // 3 levels (DRY, MODERATE, WET)
    this.paintRandomness = new ProcLayer('paint_random')
    this.paintRandomness.sampling.periodicity = 6
    if (biomeConf) this.setMappings(biomeConf)
  }

  static get instance() {
    Biome.singleton = Biome.singleton || new Biome()
    return Biome.singleton
  }

  getBiomeType(pos: Vector3): BiomeType {
    const heatVal = this.heatmap.eval(pos)
    const rainVal = this.rainmap.eval(pos)
    let heatType: Heat
    if (heatVal <= 0.33) {
      heatType = Heat.Cold
    } else if (heatVal <= 0.66) {
      heatType = Heat.Temperate
    } else {
      heatType = Heat.Hot
    }
    let rainType: Rain
    if (rainVal <= 0.33) {
      rainType = Rain.Dry
    } else if (rainVal <= 0.66) {
      rainType = Rain.Moderate
    } else {
      rainType = Rain.Wet
    }
    const biomeType = BiomesMapping[heatType][rainType] || BiomeType.Temperate
    return biomeType
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

  blockRandomization = (
    groundPos: Vector2,
    baseHeight: number,
    blockMapping: MappingRanges,
  ) => {
    const period = 0.005 * Math.pow(2, 2)
    const mapCoords = groundPos.clone().multiplyScalar(period)
    const paintRandomnessVal = this.paintRandomness.eval(mapCoords)
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
      const heightVariation = paintRandomnessVal * amplitude.low
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
      const heightVariation = paintRandomnessVal * amplitude.high
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
