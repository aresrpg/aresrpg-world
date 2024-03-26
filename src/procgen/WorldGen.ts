import { Vector2, Vector3, Box3 } from 'three'
import { PointOctree } from 'sparse-octree'

import * as Utils from '../common/utils'
import { VoxelType } from '../index'

import { GenLayer } from './ProcGenLayer'

/**
 * Filling data struct with generated data
 */
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
    // set blending map
    // const sampler = new ProceduralNoiseSampler()
    // const profiler = new HeightProfiler(CurvePresets.identity)
    // const transitionThreshold = 0.5
    // const transitionRange = 0.1
    // const transition = {
    //   lower: round2(transitionThreshold - transitionRange / 2),
    //   upper: round2(transitionThreshold + transitionRange / 2)
    // }
    // GenChainLayer.blendmap = new GenChainLayer(sampler, profiler, transition)
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
  getVoxel(position: Vector3, cache?: any) {
    const scaledNoisePos = new Vector2(position.x, position.z).multiplyScalar(
      this.samplingScale,
    )
    // caching last val for 2D heightmap case
    const val =
      cache?.lastVal ||
      GenLayer.combine(scaledNoisePos, this.procLayers, this.selection)
    if (cache) cache.lastVal = val
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
   * filling octree from noise samples
   * prune hidden blocks
   * @param octree    data struct storing points
   * @param bbox      voxel range covered by generation
   * @returns
   */
  generate(octree: PointOctree<any>, bbox: Box3) {
    let iterCount = 0
    let blocksCount = 0

    // sample volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        // cache optim for 2D heightmap only (e.g. no caverns/3D noise)
        const cache = { lastVal: null }
        let { y } = bbox.max
        let done = false
        let adjCount: number = 0
        // starting from the top all way down to bottom of voxels' column
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (!done) {
          const voxelPos = new Vector3(x, y, z)
          const voxelType = this.getVoxel(voxelPos, cache)
          let hiddenBlock = false
          // non empty voxel
          if (voxelType !== null && !isNaN(voxelType)) {
            // count adjacent voxels
            adjCount = this.checkAdjacentVoxels(voxelPos).length
            // Stats.instance.adjacentNeighboursCount(adjCount)
            hiddenBlock = adjCount === 6
            // add only visible blocks, e.g with a face in contact with air
            if (!hiddenBlock) {
              octree.set(voxelPos, { t: voxelType })
              blocksCount++
              // hiddenBlock = true
            }
          }
          iterCount++
          y--
          // stop at first hidden block found in column
          done = hiddenBlock || y < bbox.min.y
        }
      }
    }
    console.log(
      `[WorldGenerator::fill] iter count: ${iterCount}, blocks count: ${blocksCount} `,
    )
    return octree
  }
}
