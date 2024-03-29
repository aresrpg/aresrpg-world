import { Vector2, Vector3, Box3 } from 'three'

import * as Utils from '../common/utils'
import { ProcGenStats, VoxelType } from '../index'

import { GenLayer } from './ProcGenLayer'

export class WorldGenerator {
  parent: any
  samplingScale: number
  heightScale: number = 1
  procLayers: GenLayer
  voxelTypeMapper: (height: number) => VoxelType = () => 0
  selection = ''

  constructor(samplingScale: number, layerChain: GenLayer) {
    this.samplingScale = samplingScale
    this.procLayers = layerChain
    // blending map
    // const transitionThreshold = 0.5
    // const transitionRange = 0.1
    // const transition = {
    //   lower: round2(transitionThreshold - transitionRange / 2),
    //   upper: round2(transitionThreshold + transitionRange / 2)
    // }
  }

  get config() {
    return {
      selection: this.selection,
      heightScale: this.heightScale,
      samplingScale: this.samplingScale,
    }
  }

  set config(config: any) {
    this.selection = config.selection || this.selection
    this.heightScale = !isNaN(config.heightScale)
      ? config.heightScale
      : this.heightScale
    this.samplingScale = !isNaN(config.samplingScale)
      ? config.samplingScale
      : this.samplingScale
    this.procLayers = config.procLayers || this.procLayers
    // Object.preventExtensions(this.conf)
    // Object.assign(this.conf, config)
    // const { procgen, proclayers } = config
    this.parent?.onChange(this)
  }

  onChange(originator: any) {
    console.log(`[WorldGen] ${typeof originator} config has changed`)
    this.parent?.onChange(originator)
  }

  getVoxelType(voxel: Vector3) {
    return this.voxelTypeMapper(voxel.y)
  }

  /**
   * Only relevant for heightmap mode (2D)
   */
  getHeight(pos: Vector2) {
    const scaledNoisePos = pos.multiplyScalar(this.samplingScale)
    const val = GenLayer.combine(
      scaledNoisePos,
      this.procLayers,
      this.selection,
    )
    return val
  }

  /**
   * Determine block's existence based on density value evaluated at given position
   * Full or empty block is returned depending on value being above or below threshold
   * @param position voxel position to eval density at
   * @returns null if empty voxel or voxel's type if present
   */
  getBlock(position: Vector3) {
    const { x, y, z } = position
    return y < this.getHeight(new Vector2(x, z))
      ? this.voxelTypeMapper(y)
      : null
  }

  adjacentCount(position: Vector3) {
    const adjacentNeighbours = Utils.AjacentNeighbours.map(adj =>
      Utils.getNeighbour(position, adj),
    )
    const neighbours = adjacentNeighbours.filter(adjPos => {
      const groundLevel = this.getHeight(new Vector2(adjPos.x, adjPos.z))
      return adjPos.y < groundLevel
    })
    return neighbours.length
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
        let hiddenBlock = false
        let existingBlock = false
        const groundLevel = this.getHeight(new Vector2(x, z))
        // starting from the top all way down to bottom of voxels' column
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (!hiddenBlock && y >= bbox.min.y) {
          const voxelPos = new Vector3(x, y, z)
          existingBlock = voxelPos.y < groundLevel
          if (existingBlock) {
            // add only visible blocks, e.g with a face in contact with air
            hiddenBlock = pruning ? this.adjacentCount(voxelPos) === 6 : false
            if (!hiddenBlock) {
              // const voxel = {
              //   pos: voxelPos,
              //   type: voxelType
              // }
              const voxel = {
                position: voxelPos,
                materialId: this.getVoxelType(voxelPos),
              }
              yield voxel
              blocksCount++
              // hiddenBlock = true
            }
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
    ProcGenStats.instance.worldGen = {
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
