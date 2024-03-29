import { Box3, Vector2, Vector3 } from 'three'
import { IVoxelMap, IVoxelMaterial, IVoxel } from '@aresrpg/aresrpg-engine'

import { VOXEL_TYPE_COLORS } from '../common/types'

import { WorldGenerator } from './WorldGen'

export class VoxelMap implements IVoxelMap {
  public readonly size: Vector3
  worldGen
  public constructor(bbox: Box3, worldGen: WorldGenerator) {
    this.size = bbox.getSize(new Vector3())
    this.worldGen = worldGen
  }

  public readonly voxelMaterialsList = Object.values(VOXEL_TYPE_COLORS)
  getAllVoxelMaterials(): IVoxelMaterial[] {
    return Object.values(VOXEL_TYPE_COLORS)
  }

  getMaxVoxelsCount(from: Vector3, to: Vector3): number {
    const bmin = new Vector3(from.x, from.y, from.z)
    const bmax = new Vector3(to.x, to.y, to.z)
    const bbox = new Box3(bmin, bmax)
    // const res = this.voxelsOctree.cull(bbox)
    // const count: number = res.reduce(
    //   (count: number, node: any) => count + (node.data?.points?.length || 0),
    //   0,
    // )
    const count = this.worldGen.getEstimatedVoxelsCount(bbox)
    return count
  }

  iterateOnVoxels(from: Vector3, to: Vector3): Generator<IVoxel, any, unknown> {
    const bmin = new Vector3(from.x, from.y, from.z)
    const bmax = new Vector3(to.x, to.y, to.z)
    const bbox = new Box3(bmin, bmax)
    return this.worldGen.generate(bbox, true)
  }

  voxelExists(x: number, y: number, z: number): boolean {
    const h = this.worldGen.getHeight(new Vector2(x, z))
    return y < h
  }
}
