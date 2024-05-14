import { Vector3, Box3 } from 'three'
import alea from 'alea'

import { Block } from '../common/types'
import * as Utils from '../common/utils'

import { ProcLayer } from './ProcLayer'
import { Vegetation } from './Vegetation'
import { BlocksMapping, BlockType } from './BlocksMapping'
import { BlendMode, getCompositor } from './NoiseComposition'

const MODULATION_THRESHOLD = 0.318

/**
 * # Procedural generation
 * ## Modes
 * - `genHeightmapChunk`: voxels heightmap for terrain
 * - `genVolumetricChunk`: volumetric voxels for caverns
 * - `genPatch`: regular heightmap
 *
 * ## Maps
 * - `Heightmap`: terrain elevation with threshold for ocean, beach, riff, lands, mountains ..
 *  Specifies overall terrain shape and how far inland.
 * - `Amplitude` modulation (or erosion)
 * modulating terrain amplitude, to produce variants like flat, hilly lands, ..
 * - (TODO): higher density noise to make rougher terrain with quick variation
 *
 */

export class WorldGenerator {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldGenerator
  parent: any
  params = {}
  prng = alea('tree_map')
  compositor = getCompositor(BlendMode.MUL)
  // maps (externally provided)
  heightmap: ProcLayer
  amplitude: ProcLayer
  blocksMapping: BlocksMapping
  vegetation: Vegetation

  constructor() {
    this.heightmap = new ProcLayer('heightmap')
    this.amplitude = new ProcLayer('amplitude')
    this.blocksMapping = new BlocksMapping()
    this.vegetation = new Vegetation()
  }

  static get instance() {
    WorldGenerator.singleton = WorldGenerator.singleton || new WorldGenerator()
    return WorldGenerator.singleton
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
  getGroundBlock(pos: Vector3, includeSea?: boolean, rawType?: boolean) {
    const block: Block = {
      pos: pos.clone(),
      type: BlockType.ROCK
    }
    const noiseVal = this.heightmap.eval(pos)
    // noiseVal = includeSea ? Math.max(noiseVal, this.biomeMapping.params.seaLevel) : noiseVal
    const nominalVal = this.blocksMapping.getBlockLevel(noiseVal, pos, includeSea)
    const finalVal = this.applyModulation(pos, nominalVal, MODULATION_THRESHOLD)
    block.pos.y = finalVal * 255
    block.type = rawType ? block.type : this.blocksMapping.getBlockType(block.pos, noiseVal)
    return block
  }

  /**
   * 3D noise density
   * Determine block's existence based on density value evaluated at block position
   * @param position block position where density is evaluated
   */
  getVolumetricDensity() {
    throw new Error('Method not implemented.')
  }

  /**
   * Checking neighbours surrounding block's position
   * to determine if block is hidden or not
   */
  hiddenBlock(position: Vector3) {
    const adjacentNeighbours = Utils.AdjacentNeighbours.map(adj =>
      Utils.getNeighbour(position, adj),
    )
    const neighbours = adjacentNeighbours.filter(adjPos => {
      const groundBlock = this.getGroundBlock(adjPos, false, true)
      return adjPos.y <= groundBlock.pos.y
    })
    return neighbours.length === 6
  }

  *genBlocks(bbox: Box3, includeSea = false, pruneHidden = false): Generator<Block, void, unknown> {
    // Gen stats
    let iterCount = 0
    let blocksCount = 0
    // const blocksLevels = {
    //   avg: 0,
    //   min: 0,
    //   max: 0
    // }
    const startTime = Date.now()
    // fill tree buffer
    // this.vegetation.treeGen(bbox)
    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        // starting from the top of voxels' column
        const blockPos = new Vector3(x, bbox.max.y - 1, z)
        // optim for heightmap only: stop at first hidden block encountered
        let hidden = false
        const groundBlock = this.getGroundBlock(blockPos, includeSea)
        const groundLevel = groundBlock.pos.y
        blockPos.y = Math.min(Math.floor(groundLevel), bbox.max.y - 1)
        // prevent tree spawning below ground
        const maxExtraHeight = Utils.clamp(bbox.max.y - 1 - blockPos.y, 0, 255)
        const extraBuffer = maxExtraHeight ?//new Array(maxExtraHeight).fill(BlockType.TREE_TRUNK)
          this.vegetation
            .fillHeightBuffer(blockPos)
            .slice(0, maxExtraHeight - 1) : []
        blockPos.y += extraBuffer.length
        // height += this.vegetation.treeBuffer[x]?.[z] ? 15 : 0
        // height += isTree ? 10 : 0
        while (!hidden && blockPos.y >= bbox.min.y) {
          const extraType = extraBuffer.pop()
          const blockType = extraType !== undefined ? extraType : groundBlock.type
          const block: Block = { pos: blockPos.clone(), type: blockType }
          hidden =
            pruneHidden &&
            block.type !== BlockType.NONE &&
            this.hiddenBlock(block.pos)
          // only existing and visible blocks, e.g with a face in contact with air
          if (block.type !== BlockType.NONE && !hidden) {
            yield block
            blocksCount++
          }
          iterCount++
          blockPos.y--
        }
      }
    }
    const elapsedTime = Date.now() - startTime
    const genStats = {
      time: elapsedTime,
      blocks: blocksCount,
      iterations: iterCount,
    }
    genStats.blocks += 0
    // clear tree buffer
    this.vegetation.treeBuffer = {}
    // ProcGenStatsReporting.instance.worldGen = genStats
    // ProcGenStatsReporting.instance.printGenStats(genStats)
  }

  /**
   * Voxels volume on-the-fly generation for caverns
   * @param bbox
   * @param pruneHidden optionaly prune hidden voxels
   */
  // *genVolumetricChunk(bbox: Box3, pruning = false): Generator<Block, void, unknown> {
  // }

  /**
   * Regular heightmap patch
   * @param bbox
   */
  // *genPatch(bbox: Box3): Generator<Block, void, unknown> {
  // }

  /**
   * @param bbox
   * @returns
   */
  estimatedVoxelsCount(bbox: Box3): number {
    const range = bbox.getSize(new Vector3())
    return range.x * range.z * 2
  }
}
