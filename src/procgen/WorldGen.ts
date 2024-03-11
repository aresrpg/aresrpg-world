import { Vector2, Vector3, Box3 } from 'three'
import { PointOctree } from 'sparse-octree'

import { CurvePresets, HeightProfiler } from './HeightProfiler'
import { GenerationLayer } from './GenerationLayer'
import { ProceduralNoiseSampler } from './NoiseSampler'

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
  COMBINE_ALL_BLEND,
  COMBINE_ALL_OVERRIDE,
}

const HEIGHT_SCALE = 1 / 2

/**
  Generate scalar field according to multiple procedural layers combination
and generation mode.

Layers profile:
- Continental
- Erosion
- Peaks&Valleys

Generation modes: 
 * ONE LAYER
 * showing only selected layer for debug/visualization purpose
 * BLEND
 * two layers blended together according to blending map
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
  sampleScale
  layersIndex: any = {}
  config = {
    mode: GenMode.CONT,
  }

  constructor(sampleScale: number) {
    this.sampleScale = sampleScale
    // set blending map
    GenerationLayer.blendmap = new ProceduralNoiseSampler()
    let sampler, profile;
    // first pass: continentalness
    sampler = new ProceduralNoiseSampler()
    profile = new HeightProfiler(CurvePresets.continentalness)
    const continentalLayer = new GenerationLayer(sampler, profile, 0.7)
    // set as first element in chain
    GenerationLayer.first = continentalLayer
    // second pass: erosion
    sampler = new ProceduralNoiseSampler()
    profile = new HeightProfiler(CurvePresets.erosion)
    const erosionLayer = new GenerationLayer(sampler, profile, 0.7)
    // link: continentalness => erosion
    continentalLayer.nextPass = erosionLayer
    // link: erosion => peaksValleys
    // TODO
    // index layers
    this.layersIndex[LayerType.CONTINENTAL] = continentalLayer
    this.layersIndex[LayerType.EROSION] = erosionLayer
  }

  /**
   * 
   * @param point evaluated point
   * @param mode generation mode
   * @returns 
   */
  getPointValue(point: Vector2 | Vector3, mode = this.config.mode) {
    const continentalLayer: GenerationLayer = this.layersIndex[LayerType.CONTINENTAL]
    const erosionLayer: GenerationLayer = this.layersIndex[LayerType.EROSION]
    let pointVal = 0;
    switch (mode) {
      case GenMode.CONT:
        pointVal = continentalLayer.eval(point)
        break
      case GenMode.ERO:
        pointVal = erosionLayer.eval(point)
        break
      case GenMode.BLEND_CONT_ERO:
        pointVal = continentalLayer.blendWith(erosionLayer)(point)
        break;
      case GenMode.COMBINE_ALL_BLEND:
        pointVal = GenerationLayer.first.combine(point)
        break;
      case GenMode.COMBINE_ALL_OVERRIDE:
        pointVal = GenerationLayer.first.combine(point, false)
        break;
    }
    return HEIGHT_SCALE * pointVal;
  }

  /**
   * filling octree from noise samples
   * @param octree    data struct storing points
   * @param bbox      voxel range covered by generation
   * @returns
   */
  fill(octree: PointOctree<any>, bbox: Box3) {
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
