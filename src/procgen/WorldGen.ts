import { Vector2, Vector3 } from 'three'

import { CurvePresets, HeightProfiler, ProfileType } from './HeightProfiler'
import { ISampler, ProceduralNoise2DSampler } from './NoiseSampler'

/**
 * Filling octree struct with voxels
 */
export class WorldGenerator {
  noiseScale
  sampler: ISampler<Vector2>
  generators: any = {} // WIP support for multiple noise/heightProfile

  constructor(noiseScale) {
    this.noiseScale = noiseScale
    this.generators.continentalness = new ProceduralNoise2DSampler()
    HeightProfiler.addProfile(
      CurvePresets.continentalness,
      ProfileType.Continentalness,
    )
  }

  // mapping noise to height
  getHeight(noiseCoords) {
    const noiseVal = this.generators.continentalness.query(noiseCoords)
    const profiledHeight = HeightProfiler.apply(
      ProfileType.Continentalness,
      noiseVal,
    )
    return profiledHeight
  }

  /**
   * filling octree from noise samples
   * @param octree    data struct storing points
   * @param bbox      voxel range covered by generation
   * @returns
   */
  fill(octree, bbox) {
    let iterCount = 0
    let blocksCount = 0
    // sample volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        const noiseCoords = new Vector2(x, z)
        noiseCoords.multiplyScalar(this.noiseScale) // mapping voxel position to noise coords
        const groundLevel = this.getHeight(noiseCoords) / 2
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
