import { Vector2, Vector3, Box3 } from 'three'
import { Block, BlockType } from '../common/types'
import { GenLayer } from './ProcGenLayer'
import { GenStats } from '../common/stats'
import * as Utils from '../common/utils'

export class WorldGenerator {
  static singleton: WorldGenerator
  parent: any
  samplingScale: number = 1 / 8 // 8 blocks per unit of noise
  heightScale: number = 1
  blockTypeMapper: (height: number) => BlockType = () => 0
  procLayers!: GenLayer
  layerSelection!: string

  constructor() {
    // blending map
    // const transitionThreshold = 0.5
    // const transitionRange = 0.1
    // const transition = {
    //   lower: round2(transitionThreshold - transitionRange / 2),
    //   upper: round2(transitionThreshold + transitionRange / 2)
    // }
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
    this.procLayers = config.procLayers || this.procLayers
    this.blockTypeMapper = config.blockTypeMapper
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
   * Determine block's existence based on density value evaluated at given position
   * @param position voxel position to eval density at
   * @returns block or null if present or not
   */
  getBlock(pos: Vector3): Block | null {
    // const { x, y, z } = position
    // eval density at block position
    // check density value is above or below threshold to determine if block is empty or not
    const blockExists = true//y < this.getHeight(new Vector2(x, z))  // TODO
    const blockType = this.blockTypeMapper(pos.y)
    const block = {
      pos,
      type: blockType
    }
    return blockExists ? block : null
  }

  /**
   * Only relevant for heightmap mode (2D)
   */
  getHeight(pos: Vector2) {
    const scaledNoisePos = pos.multiplyScalar(this.samplingScale)
    const val = GenLayer.combine(
      scaledNoisePos,
      this.procLayers,
      this.layerSelection,
    )
    return val
  }

  /**
   * Checking neighbours surrounding block position to determine
   * if block is hidden or not
   */
  hiddenBlock(position: Vector3) {
    const adjacentNeighbours = Utils.AdjacentNeighbours.map(adj =>
      Utils.getNeighbour(position, adj),
    )
    const neighbours = adjacentNeighbours.filter(adjPos => {
      const groundLevel = this.getHeight(new Vector2(adjPos.x, adjPos.z))
      return adjPos.y < groundLevel
    })
    return neighbours.length === 6
  }

  /**
   * on-the-fly generation from bounding box
   * @param bbox
   * @param pruning optional hidden blocks pruning
   */
  *generate(bbox: Box3, pruning = true) {
    let iterCount = 0
    let blocksCount = 0
    const startTime = Date.now()
    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        let y = bbox.max.y - 1
        let hidden = false
        const groundLevel = this.getHeight(new Vector2(x, z))
        // starting from the top all way down to bottom of voxels' column
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (!hidden && y >= bbox.min.y) {
          const blockPos = new Vector3(x, y, z)
          const block = blockPos.y < groundLevel ? this.getBlock(blockPos) : null
          hidden = pruning && !!block && this.hiddenBlock(block.pos)
          // add only visible blocks, e.g with a face in contact with air
          if (block && !hidden) {
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
    GenStats.instance.worldGen = {
      time: elapsedTime,
      blocks: blocksCount,
      iterations: iterCount,
    }
  }

  getEstimatedVoxelsCount(bbox: Box3): number {
    const range = bbox.getSize(new Vector3())
    return range.x * range.z * 2
  }
}
