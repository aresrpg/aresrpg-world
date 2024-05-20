import { Vector3 } from 'three'

import { Block } from '../common/types'

import { ProcLayer } from './ProcLayer'
import { Biome, BlockType } from './Biome'
import { BlendMode, getCompositor } from './NoiseComposition'
import { BlockIteratorData } from './BlocksPatch'

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
  // eslint-disable-next-line no-use-before-define
  static singleton: Heightmap
  parent: any
  params = {}
  compositor = getCompositor(BlendMode.MUL)
  // maps (externally provided)
  heightmap: ProcLayer
  amplitude: ProcLayer

  constructor() {
    this.heightmap = new ProcLayer('heightmap')
    this.amplitude = new ProcLayer('amplitude')
  }

  static get instance() {
    Heightmap.singleton = Heightmap.singleton || new Heightmap()
    return Heightmap.singleton
  }

  applyModulation(input: Vector3, initialVal: number, threshold: number) {
    let finalVal = initialVal
    const aboveThreshold = initialVal - threshold // rawVal - threshold
    // modulates height after threshold according to amplitude layer
    if (aboveThreshold > 0) {
      const modulation = this.amplitude.eval(input)
      const blendingWeight = 3
      // blendingWeight /= (threshold + modulatedVal) > 0.8 ? 1.2 : 1
      const modulatedVal = this.compositor(
        aboveThreshold,
        modulation,
        blendingWeight,
      )
      finalVal = threshold + modulatedVal
    }
    return finalVal
  }

  /**
   * 
   * @param pos 
   * @param includeSea 
   * @param rawType default type
   * @returns 
   */
  getGroundBlock(pos: Vector3, buildData?: BlockIteratorData, includeSea?: boolean, rawType?: boolean) {
    const block: Block = {
      pos: pos.clone(),
      type: BlockType.ROCK,
    }
    const noiseVal = this.heightmap.eval(pos)
    const biomeType = buildData?.biome || Biome.instance.getBiomeType(block.pos)
    // noiseVal = includeSea ? Math.max(noiseVal, Biome.instance.params.seaLevel) : noiseVal
    const nominalVal = Biome.instance.getBlockLevel(noiseVal, biomeType, includeSea)
    const finalVal = this.applyModulation(pos, nominalVal, MODULATION_THRESHOLD)
    block.pos.y = Math.floor(finalVal * 255)
    block.type = rawType ? block.type : Biome.instance.getBlockType(block.pos, noiseVal)
    if (buildData) {
      buildData.data.level = block.pos.y
      buildData.data.type = block.type
      // buildData.data.raw = noiseVal
    }
    return block
  }
}
