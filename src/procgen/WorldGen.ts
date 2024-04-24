import { Vector2, Vector3, Box3 } from 'three'

import { Block, BlockType, TerrainBlocksMapping } from '../common/types'
import * as Utils from '../common/utils'
import { LinkedList } from '../common/misc'

import { GenLayer } from './ProcGenLayer'
import { SimplexNoiseSampler } from './NoiseSampler'
import { ProcGenStatsReporting } from '../tools/StatsReporting'

export class WorldGenerator {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldGenerator
  parent: any
  samplingScale: number = 1 / 8 // 8 blocks per unit of noise
  heightScale: number = 1
  // externally provided
  terrainBlocksMapping!: LinkedList<TerrainBlocksMapping>
  procLayers!: GenLayer
  layerSelection!: string
  paintingRandomness = new SimplexNoiseSampler('paintingSeed')
  seaLevel = 50

  constructor() {
    // this.paintingRandomness.noiseParams.harmonics.period = 256
    this.paintingRandomness.onChange(this)
  }

  static get instance() {
    WorldGenerator.singleton = WorldGenerator.singleton || new WorldGenerator()
    return WorldGenerator.singleton
  }

  get config() {
    return {
      selection: this.layerSelection,
      heightScale: this.heightScale,
      samplingScale: this.samplingScale,
      seaLevel: this.seaLevel,
    }
  }

  set config(config: any) {
    this.layerSelection = config.selection || this.layerSelection
    this.heightScale = !isNaN(config.heightScale)
      ? config.heightScale
      : this.heightScale
    this.samplingScale = !isNaN(config.samplingScale)
      ? config.samplingScale
      : this.samplingScale
    this.seaLevel = !isNaN(config.seaLevel) ? config.seaLevel : this.seaLevel
    this.procLayers = config.procLayers || this.procLayers
    const {
      terrainBlocksMapping,
    }: { terrainBlocksMapping: TerrainBlocksMapping[] } = config
    if (terrainBlocksMapping) {
      this.terrainBlocksMapping = LinkedList.fromArray<TerrainBlocksMapping>(
        terrainBlocksMapping,
        (a, b) => a.threshold - b.threshold,
      )
    }
    // Object.preventExtensions(this.conf)
    // Object.assign(this.conf, config)
    // const { procgen, proclayers } = config
    this.parent?.onChange(this)
  }

  onChange(originator: any) {
    console.log(`[WorldGen] ${typeof originator} config has changed`)
    this.parent?.onChange(originator)
  }

  /**
   * 3D noise density for caverns
   */
  getDensity() {
    throw new Error('Method not implemented.')
  }

  /**
   * 2D noise for heightmap
   */
  getRawHeight(pos: Vector2) {
    const scaledNoisePos = pos.multiplyScalar(this.samplingScale)
    const val = GenLayer.combine(
      scaledNoisePos,
      this.procLayers,
      this.layerSelection,
    )
    return val * 255
  }

  /**
   * Overall height (ground + water)
   */
  getHeight(pos: Vector2) {
    const rawHeight = this.getRawHeight(pos)
    return Math.max(rawHeight, this.seaLevel)
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
      const groundLevel = this.getHeight(new Vector2(adjPos.x, adjPos.z))
      return adjPos.y <= groundLevel
    })
    return neighbours.length === 6
  }

  getBlockType = (block: Vector3) => {
    const { x, y, z } = block
    const period = 0.005
    const baseHeight = y
    let current = this.terrainBlocksMapping
    let previous = this.terrainBlocksMapping
    while (current.next && current.next.data.threshold < baseHeight) {
      previous = current
      current = current.next
    }
    const { next } = current
    // add some height variations to have less boring painting
    const { randomness } = current.data
    const bounds = {
      lower: current.data.threshold,
      upper: next?.data.threshold || 1,
    }
    // nominal type
    let { blockType } = current.data
    // randomize on lower side
    if (
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - randomness.low < bounds.lower
    ) {
      const groundPos = new Vector2(x, z).multiplyScalar(period)
      const heightVariation =
        this.paintingRandomness.eval(groundPos) * randomness.low
      const varyingHeight = baseHeight - heightVariation
      blockType =
        varyingHeight < current.data.threshold
          ? previous.data.blockType
          : current.data.blockType
    }
    // randomize on upper side
    else if (baseHeight + randomness.high > bounds.upper && next) {
      const groundPos = new Vector2(x, z).multiplyScalar(period)
      const heightVariation =
        this.paintingRandomness.eval(groundPos) * randomness.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > next.data.threshold
          ? next.data.blockType
          : current.data.blockType
    }

    return blockType
  }

  /**
   * Determine block's existence based on density value evaluated at block position
   * @param position block position where density is evaluated
   * @returns existing block or null if empty
   */
  getBlock(pos: Vector3): BlockType {
    const { x, y, z } = pos
    // eval density at block position
    const density = this.getHeight(new Vector2(x, z)) // TODO replace by real density val
    // determine if block is empty or not based on density val being above or below threshold
    const blockExists = y <= density
    return blockExists ? this.getBlockType(pos) : BlockType.NONE
  }

  /**
   * on-the-fly generation from bounding box
   * @param bbox
   * @param pruning optional hidden blocks pruning
   */
  *generate(bbox: Box3, pruning = false): Generator<Block, void, unknown> {
    let iterCount = 0
    let blocksCount = 0
    const startTime = Date.now()
    const { seaLevel } = this
    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        // starting from the top of voxels' column
        let y = bbox.max.y - 1
        // optim for heightmap only: stop at first hidden block encountered
        let hidden = false
        const groundLevel = this.getHeight(new Vector2(x, z))
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (!hidden && y >= bbox.min.y) {
          const blockPos = new Vector3(x, y, z)
          const blockType =
            blockPos.y < Math.max(groundLevel, seaLevel)
              ? this.getBlockType(blockPos)
              : BlockType.NONE
          const block: Block = { pos: blockPos, type: blockType }
          hidden =
            pruning &&
            block.type !== BlockType.NONE &&
            this.hiddenBlock(block.pos)
          // only existing and visible block, e.g with a face in contact with air
          if (block.type !== BlockType.NONE && !hidden) {
            yield block
            blocksCount++
          }
          iterCount++
          y--
        }
      }
    }
    const elapsedTime = Date.now() - startTime
    // console.log(
    //   `[WorldGenerator::fill] iter count: ${iterCount},
    //   blocks count: ${blocksCount}
    //   chunk min/max: ${voxelMinMax.min.y}, ${voxelMinMax.max.y}
    //   elapsed time: ${elapsedTime} ms`
    // )
    ProcGenStatsReporting.instance.worldGen = {
      time: elapsedTime,
      blocks: blocksCount,
      iterations: iterCount,
    }
  }

  /**
   * @param bbox
   * @returns
   */
  estimatedVoxelsCount(bbox: Box3): number {
    const range = bbox.getSize(new Vector3())
    return range.x * range.z * 2
  }
}
