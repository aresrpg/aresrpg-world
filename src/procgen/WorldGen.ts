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

  /**
   *
   * @param position voxel position
   * @param mode
   * @returns null if no voxel or voxel's type if any
   */
  getVoxel(position: Vector3) {
    const scaledNoisePos = new Vector2(position.x, position.z).multiplyScalar(
      this.samplingScale,
    )
    // caching last val for 2D heightmap case
    const val = GenLayer.combine(
      scaledNoisePos,
      this.procLayers,
      this.selection,
    )
    return position.y < val ? this.voxelTypeMapper(position.y) : null
  }

  checkAdjacentVoxels(position: Vector3) {
    const adjacentNeighbours = Utils.AjacentNeighbours.map(adj =>
      Utils.getNeighbour(position, adj),
    )
    const neighbourEvals = adjacentNeighbours.map(adjPos =>
      this.getVoxel(adjPos),
    )
    return neighbourEvals.filter(val => val)
  }

  /**
   * on-the-fly generation
   * @param bbox
   * @param pruning optional hidden blocks pruning
   */
  *generate(bbox: Box3, pruning = true) {
    let iterCount = 0
    let blocksCount = 0
    const voxelMinMax = new Box3()
    const startTime = Date.now()
    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        let { y } = bbox.max
        let isVisibleBlock = true
        let adjCount: number = 0
        let voxelMax, voxelMin
        // starting from the top all way down to bottom of voxels' column
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (isVisibleBlock && y >= bbox.min.y) {
          const voxelPos = new Vector3(x, y, z)
          const voxelType = voxelMax
            ? this.voxelTypeMapper(voxelPos.y)
            : this.getVoxel(voxelPos)
          isVisibleBlock = true
          if (voxelType !== null && !isNaN(voxelType)) {
            voxelMax = voxelMax || voxelPos // store first non empty voxel
            voxelMin = voxelPos
            // add only visible blocks, e.g with a face in contact with air
            if (pruning) {
              // count adjacent voxels
              adjCount = this.checkAdjacentVoxels(voxelPos).length
              // Stats.instance.adjacentNeighboursCount(adjCount)
              isVisibleBlock = adjCount !== 6
            }
            if (isVisibleBlock) {
              // const voxel = {
              //   pos: voxelPos,
              //   type: voxelType
              // }
              const voxel = {
                position: voxelPos,
                materialId: voxelType,
              }
              yield voxel
              blocksCount++
              // hiddenBlock = true
            }
          }
          iterCount++
          y--
        }
        voxelMinMax.min =
          voxelMin && voxelMin.y < voxelMinMax.min.y
            ? voxelMin
            : voxelMinMax.min
        voxelMinMax.max =
          voxelMax && voxelMax.y > voxelMinMax.max.y
            ? voxelMax
            : voxelMinMax.max
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
