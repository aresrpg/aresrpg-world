import { Vector2, Vector3, Box3 } from 'three'
import { PointOctree } from 'sparse-octree'
import { InputType } from './NoiseSampler'
import { CombineMode, GenChainLayer } from './GenChainLayer'



/**
 * Filling data struct with generated data
 */
export class WorldGenerator {
  parent: any
  sampleScale: number
  heightScale: number = 1
  genMode: CombineMode = CombineMode.CURRENT
  chainFirstLayer: GenChainLayer

  constructor(sampleScale: number, layerChain: GenChainLayer) {
    this.sampleScale = sampleScale
    this.chainFirstLayer = layerChain
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
      genMode: this.genMode,
      heightScale: this.heightScale
    }
  }

  set config(config) {
    this.genMode = config.genMode || this.genMode
    this.heightScale = !isNaN(config.heightScale) ? config.heightScale : this.heightScale
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
   * @param point evaluated point
   * @param mode generation mode
   * @returns 
   */
  getPointValue(point: InputType, mode = this.genMode) {
    const pointVal = GenChainLayer.combineEvals(point, this.chainFirstLayer, mode)
    return this.heightScale * pointVal;
  }

  /**
   * filling octree from noise samples
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
        const noiseCoords = new Vector2(x, z)
        noiseCoords.multiplyScalar(this.sampleScale) // mapping voxel position to noise coords
        const groundLevel = this.getPointValue(noiseCoords)

        for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
          const voxelPoint = new Vector3(x, y, z)
          // discard every blocks above ground level
          if (voxelPoint.y < groundLevel) {
            octree.set(voxelPoint, {})
            blocksCount++
            break;
          }
          iterCount++
        }
      }
    }
    console.log(
      `[WorldGenerator::fill] iter count: ${iterCount}, blocks count: ${blocksCount} `,
    )
    return octree
  }
}
