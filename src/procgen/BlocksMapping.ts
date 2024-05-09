import { Vector2, Vector3 } from 'three'

import { LinkedList } from '../common/misc'
import { MappingConf, MappingData, MappingRanges } from '../common/types'
import * as Utils from '../common/utils'

import { ProcLayer } from './ProcLayer'
import { WorldGenerator } from './WorldGen'

export enum BlockType {
  NONE,
  WATER,
  TREE_TRUNK,
  TREE_FOLIAGE,
  SAND,
  GRASS,
  MUD,
  ROCK,
  SNOW,
}

const MappingRangeSorter = (item1: MappingData, item2: MappingData) =>
  item1.x - item2.x

/**
 * assign block types: water, sand, grass, mud, rock, snow, ..
 */
export class BlocksMapping {
  mappingRanges!: MappingRanges
  paintRandomness: ProcLayer

  constructor(mappingConf?: MappingConf) {
    this.paintRandomness = new ProcLayer('paint_random')
    this.paintRandomness.sampling.periodicity = 6
    if (mappingConf) this.setMappingRanges(mappingConf)
  }

  params = {
    seaLevel: 0,
  }

  setMappingRanges(mappingConf: MappingConf) {
    const mappingItems = Object.values(mappingConf)
    this.mappingRanges = LinkedList.fromArrayAfterSorting(
      mappingItems,
      MappingRangeSorter,
    )
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
    let blockType
    // randomize on lower side
    if (
      blockMapping.prev &&
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - amplitude.low < bounds.lower
    ) {
      const heightVariation = paintRandomnessVal * amplitude.low
      const varyingHeight = baseHeight - heightVariation
      blockType =
        varyingHeight < blockMapping.data.x
          ? blockMapping.prev?.data.blockType
          : blockMapping.data.blockType
    }
    // randomize on upper side
    else if (blockMapping.next && baseHeight + amplitude.high > bounds.upper) {
      //   let heightVariation =
      //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
      // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
      const heightVariation = paintRandomnessVal * amplitude.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > blockMapping.next.data.x
          ? blockMapping.next.data.blockType
          : blockMapping.data.blockType
    }
    return blockType
  }

  getBlockLevel = (rawVal: number, noSea = false) => {
    const { seaLevel } = this.params
    const validInput = Utils.clamp(rawVal, 0, 1)
    const matchingRange = Utils.findMatchingRange(rawVal, this.mappingRanges)
    const upperRange = matchingRange.next || matchingRange
    const min = new Vector2(matchingRange.data.x, matchingRange.data.y)
    const max = new Vector2(upperRange.data.x, upperRange.data.y)
    const interpolated = Utils.interpolatePoints(min, max, validInput)
    return noSea ? interpolated : Math.max(interpolated, seaLevel)
  }

  getBlockType = (blockPos: Vector3, rawVal: number) => {
    // nominal block type
    let matchingRange = Utils.findMatchingRange(rawVal, this.mappingRanges)
    while (!matchingRange.data.blockType && matchingRange.prev) {
      matchingRange = matchingRange.prev
    }
    const nominalType = matchingRange.data.blockType || BlockType.NONE
    // trigger tree gen on applicable regions
    matchingRange.data.treeSpawn &&
      WorldGenerator.instance.vegetation.treeSpawner(blockPos)
    // const finalBlockType = this.blockRandomization(groundPos, baseHeight, currentBlockMap)
    // if (finalBlockType !== nominalBlockType) console.log(`[getBlockType] nominal${nominalBlockType} random${finalBlock}`)
    return nominalType // finalBlock
  }
}
