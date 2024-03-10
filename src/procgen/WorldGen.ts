import { Vector2, Vector3, Box3 } from 'three'
import { PointOctree } from 'sparse-octree'

import { CurvePresets, HeightProfiler } from './HeightProfiler'
import { ProceduralNoise2DSampler } from './NoiseSampler'
import { GenerationLayer } from './GenerationLayer'

export enum LayerType {
  CONTINENTAL = "continental",
  EROSION = "erosion",
}

/**
 * Generation modes:
 */
export enum GenMode {
  MONO_CONT = "continental",
  MONO_ERO = "erosion",
  DUAL_CONT_ERO = "blend C+E",
  THRESHOLD_BLEND = "chain layers",
  THRESHOLD_NO_BLEND = "chain layers no blend",
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
 * MONO
 * showing only selected profile for debug/visualization purpose
 * DUAL
 * two layers blended together according to blending map
 * THRESHOLD
 * profiles are linked in specific order and holds threshold value that tells
 * if iterating to next layer is required.
 * Generation starts by looking at first layer and checking its value.
 * - if below threshold it will apply current layer profile
 * - or if above threshold, it will move to next layer in linked list and redo same process.
 * Depnding on blend/noblend mode, layer will either:
 * - override all preceding layers
 * - or blend with previous layers to avoid discontinuity
 */
export class WorldGenerator {
  sampleScale
  layersIndex: any = {}
  chainFirstLayer: GenerationLayer
  config = {
    mode: GenMode.MONO_CONT,
  }

  constructor(sampleScale: number) {
    this.sampleScale = sampleScale
    // blending layer
    let sampler = new ProceduralNoise2DSampler()
    let profile = new HeightProfiler(CurvePresets.identity)
    GenerationLayer.blendmap = new GenerationLayer(sampler, profile, 0)
    // first pass: continentalness
    sampler = new ProceduralNoise2DSampler()
    profile = new HeightProfiler(CurvePresets.continentalness)
    const continentalLayer = new GenerationLayer(sampler, profile, 0.7)
    // set as first element in chain
    this.chainFirstLayer = continentalLayer
    // second pass: erosion
    sampler = new ProceduralNoise2DSampler()
    profile = new HeightProfiler(CurvePresets.erosion)
    const erosionLayer = new GenerationLayer(sampler, profile, 0.7)
    // link layers
    continentalLayer.nextPass = erosionLayer

    // index layers
    this.layersIndex[LayerType.CONTINENTAL] = continentalLayer
    this.layersIndex[LayerType.EROSION] = erosionLayer
  }

  /*
   * @param point 
   * @returns 
   */
  evalPoint(point: Vector2 | Vector3) {
    const genMode = this.config.mode
    const continentalLayer: GenerationLayer = this.layersIndex[LayerType.CONTINENTAL]
    const erosionLayer: GenerationLayer = this.layersIndex[LayerType.EROSION]
    let pointVal;
    switch (genMode) {
      case GenMode.MONO_CONT:
        pointVal = continentalLayer.eval(point)
        break
      case GenMode.MONO_ERO:
        pointVal = erosionLayer.eval(point)
        break
      case GenMode.DUAL_CONT_ERO:
        pointVal = GenerationLayer.blendLayers(continentalLayer, erosionLayer, point)
        break;
      case GenMode.THRESHOLD_BLEND:
        pointVal = this.chainFirstLayer.chainEval(point)
        break;
      case GenMode.THRESHOLD_NO_BLEND:
        pointVal = this.chainFirstLayer.chainEval(point, true)
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
        // const groundLevel = this.chainFirstLayer.eval(noiseCoords) / 2
        const groundLevel = this.evalPoint(noiseCoords)

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
