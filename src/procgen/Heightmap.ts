import { Vector3 } from 'three'

import { ProcLayer } from './ProcLayer'
import { Biome, BiomeInfluence } from './Biome'
import { BlendMode, getCompositor } from './NoiseComposition'

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
    biomeInfluence =
      biomeInfluence || Biome.instance.getBiomeInfluence(blockPos)
    // (blockData as BlockIterData).cache.type = Biome.instance.getBlockType(blockPos, noiseVal)
    // noiseVal = includeSea ? Math.max(noiseVal, Biome.instance.params.seaLevel) : noiseVal
    const initialVal = Biome.instance.getBlockLevelInterpolated(
      rawVal,
      biomeInfluence,
    )
    // const initialVal = Biome.instance.getBlockLevel(rawVal, Biome.instance.getBiomeType(biomeInfluence))
    const finalVal = this.applyModulation(
      blockPos,
      initialVal,
      MODULATION_THRESHOLD,
    )
    blockPos.y = Math.floor(finalVal * 255)
    return blockPos.y
  }
}
