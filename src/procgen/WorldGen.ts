import { Vector2, Vector3, Box3 } from 'three'
import { PointOctree } from 'sparse-octree'

import { CurvePresets, HeightProfiler } from './HeightProfiler'
import { ProceduralNoiseSampler } from './NoiseSampler'
import { round2 } from '../common/utils'
import { GenLayer } from './GenLayer'

export enum LayerType {
  CONTINENTAL = "continental",
  EROSION = "erosion",
}

/**
 * Generation modes:
 */
export enum GenMode {
  CONT,
  ERO,
  BLEND_CONT_ERO,
  COMBINE_ALL,
  MIN,
  MAX,
  MIN_MAX_ALTERNATE
}

/**
  Generate scalar field according to multiple procedural layers combination
and generation mode.

Layer profiles:
- Continental
- Erosion
- Peaks&Valleys

Generation modes: 
 * ONE LAYER
 * showing only selected layer for debug/visualization purpose
 * BLEND
 * two layers blended together according to blending map acting as layer selector
 * COMBINE_ALL
 * Generation starts by evaluating first layer:
 * - if value below threshold return current value
 * - if value above threshold, move to next layer and repeat until value below threshold 
 * or no profile remains
 * Depending on blend/override mode, matching layer:
 * - override all preceding layers
 * - or blend with previous layers to avoid discontinuity
 */
export class WorldGenerator {
  parent: any
  sampleScale: number
  heightScale: number = 1
  genMode: GenMode = GenMode.CONT
  layersIndex: Record<string, GenLayer> = {}

  constructor(sampleScale: number) {
    this.sampleScale = sampleScale
    // set blending map
    const sampler = new ProceduralNoiseSampler()
    const profiler = new HeightProfiler(CurvePresets.identity)
    const transitionThreshold = 0.5
    const transitionRange = 0.1
    const transition = {
      lower: round2(transitionThreshold - transitionRange / 2),
      upper: round2(transitionThreshold + transitionRange / 2)
    }
    GenLayer.blendmap = new GenLayer(sampler, profiler, transition)
  }

  get config() {
    return {
      genMode: this.genMode,
      heightScale: this.heightScale
    }
  }

  set config(config) {
    this.genMode = !isNaN(config.genMode) ? config.genMode : this.genMode
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
  getPointValue(point: Vector2 | Vector3, mode = this.genMode) {
    const continentalLayer: GenLayer = this.layersIndex[LayerType.CONTINENTAL]
    const erosionLayer: GenLayer = this.layersIndex[LayerType.EROSION]
    let pointVal = 0;
    switch (mode) {
      case GenMode.CONT:
        pointVal = continentalLayer.eval(point)
        break
      case GenMode.ERO:
        pointVal = erosionLayer.eval(point)
        break
      case GenMode.BLEND_CONT_ERO:
        pointVal = GenLayer.blendLayers(continentalLayer, erosionLayer)(point)
        break;
      case GenMode.COMBINE_ALL:
        pointVal = GenLayer.first.combine(point)
        break;
      case GenMode.MIN:
        pointVal = GenLayer.minValue(continentalLayer, erosionLayer, point)
        break;
      case GenMode.MAX:
        pointVal = GenLayer.maxValue(continentalLayer, erosionLayer, point)
        break;
      case GenMode.MIN_MAX_ALTERNATE:
        pointVal = GenLayer.minMaxAlternate(continentalLayer, erosionLayer, point)
        break;
    }
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
        const groundLevel = this.getPointValue(noiseCoords, GenMode.CONT)

        for (let { y } = bbox.min; y < bbox.max.y; y++) {
          const voxelPoint = new Vector3(x, y, z)
          // discard every blocks above ground level
          if (voxelPoint.y < groundLevel) {
            octree.set(voxelPoint, {})
            blocksCount++
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
