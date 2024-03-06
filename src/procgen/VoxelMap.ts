import { Box3, Vector3 } from 'three'
import {
    OctreeIterator,
    PointData,
    PointOctant,
    PointOctree,
} from 'sparse-octree'
import { AresRpgEngine } from '@aresrpg/aresrpg-engine'

import { getVoxelTypeFromHeight } from '../common/utils'
import { VOXEL_TYPE_COLORS } from '../common/constants'

export class VoxelMap implements AresRpgEngine.IVoxelMap {
    public readonly size: Vector3
    voxelsOctree
    public constructor(bbox: Box3) {
        this.size = bbox.getSize(new Vector3())
        this.voxelsOctree = new PointOctree(bbox.min, bbox.max, 0.0, 8, 8)
    }

    public readonly voxelMaterialsList = Object.values(VOXEL_TYPE_COLORS)
    getAllVoxelMaterials(): AresRpgEngine.IVoxelMaterial[] {
        return Object.values(VOXEL_TYPE_COLORS)
    }

    getMaxVoxelsCount(from: Vector3, to: Vector3): number {
        const bmin = new Vector3(from.x, from.y, from.z)
        const bmax = new Vector3(to.x, to.y, to.z)
        const bbox = new Box3(bmin, bmax)
        const res = this.voxelsOctree.cull(bbox)
        const count = res.reduce(
            (count, oct) => count + (oct.data?.points?.length || 0),
            0,
        )
        return count
    }

    iterateOnVoxels(
        from: Vector3,
        to: Vector3,
    ): Generator<AresRpgEngine.IVoxel, any, unknown> {
        const bmin = new Vector3(from.x, from.y, from.z)
        const bmax = new Vector3(to.x - 1, to.y - 1, to.z - 1)
        const bbox = new Box3(bmin, bmax)
        const iter = new OctreeIterator(this.voxelsOctree, bbox)

        function* makeGenerator() {
            let result = iter.next()
            while (!result.done) {
                if (result.value.data) {
                    const pointOctant: PointOctant<PointData<any>> = result.value
                    const points = pointOctant.data?.points || []
                    for (const point of points) {
                        const voxel: AresRpgEngine.IVoxel = {
                            position: point,
                            materialId: getVoxelTypeFromHeight(point.y),
                        }
                        // console.log("iter")
                        if (
                            voxel.position.x >= from.x &&
                            voxel.position.x < to.x &&
                            voxel.position.y >= from.y &&
                            voxel.position.y < to.y &&
                            voxel.position.z >= from.z &&
                            voxel.position.z < to.z
                        )
                            yield voxel
                    }
                }
                result = iter.next()
            }
        }
        return makeGenerator()
    }

    voxelExists(x: number, y: number, z: number): boolean {
        const point = new Vector3(x, y, z)
        const exists = !!this.voxelsOctree.findPoints(point, 0.001).length
        return exists
    }
}
