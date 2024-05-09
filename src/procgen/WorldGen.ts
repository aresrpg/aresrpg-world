import { Vector3, Box3 } from 'three'
import alea from 'alea'
import { ProcLayer } from './ProcLayer'
import { Vegetation } from "./Vegetation";
import { BlocksMapping, BlockType } from "./BlocksMapping";
import { BlendMode, getCompositor } from "./NoiseComposition";
import { Block } from '../common/types';
import * as Utils from '../common/utils'

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
  params = {
  }
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

  modulate(input: Vector3, initialVal: number, threshold: number) {
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

  /**
   * 2D noise
   */
  getHeight(pos: Vector3, noSea?: boolean) {
    const noiseVal = this.heightmap.eval(pos)
    const nominalVal = this.blocksMapping.getBlockLevel(noiseVal, noSea)
    const finalVal = this.modulate(pos, nominalVal, 0.318)
    const defaultType = this.blocksMapping.getBlockType(pos, noiseVal)
    return finalVal * 255
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
      const groundLevel = this.getHeight(adjPos)
      return adjPos.y <= groundLevel
    })
    return neighbours.length === 6
  }

  *genBlocks(bbox: Box3,
    includeSea = false,
    pruning = false,): Generator<Block, void, unknown> {
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
        const noiseVal = this.heightmap.eval(blockPos)
        const mappedVal = this.blocksMapping.getBlockLevel(noiseVal)
        const finalVal = this.modulate(blockPos, mappedVal, 0.318)
        let height = finalVal * 255
        blockPos.y = Math.floor(height)
        const defaultType = this.blocksMapping.getBlockType(blockPos, noiseVal)
        const treeBuffer = this.vegetation.fillHeightBuffer(blockPos)
        blockPos.y+= treeBuffer.length
        // height += this.vegetation.treeBuffer[x]?.[z] ? 15 : 0
        // height += isTree ? 10 : 0
        while (!hidden && blockPos.y >= bbox.min.y) {
          const treeBlock = treeBuffer.pop()
          const blockType = treeBlock !== undefined ? treeBlock : defaultType
          const block: Block = { pos: blockPos.clone(), type: blockType }
          hidden =
            pruning &&
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
    // clear tree buffer
    this.vegetation.treeBuffer = {}
    // ProcGenStatsReporting.instance.worldGen = genStats
    // ProcGenStatsReporting.instance.printGenStats(genStats)
  }

  /**
   * Voxels volume on-the-fly generation for caverns
   * @param bbox
   * @param pruning optionaly prune hidden voxels
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
