import { Box3, Vector3 } from 'three'
import { OctreeIterator, PointOctree } from 'sparse-octree'
import { AresRpgEngine } from '@aresrpg/aresrpg-engine'

import * as Utils from '../common/utils'
import { VOXEL_TYPE_COLORS } from '../common/constants'
import { VoxelStore } from './VoxelStore'

const RADIUS = new Vector3(1, 1, 1).length()

export enum ITER_MODE {
    OPTIM1 = "OPTIM#1",
    OPTIM2 = "OPTIM#2",
    SKIP_NEIGHBOURS = "SKIP_NEIGHBOURS"
}

const getNeighbours = (point: Vector3, voxelsOctree: PointOctree, iterMode = ITER_MODE.NEW) => {
    let neighbours = {}
    switch (iterMode) {
        case ITER_MODE.SKIP_NEIGHBOURS:
            break;
        case ITER_MODE.OPTIM1:
            const neighbourItems = voxelsOctree.findPoints(point, RADIUS + 0.01, true)
            const oldNeighbours: any = {}
            neighbourItems.forEach((neighbour: any) => {
                const sub = neighbour.point.clone().sub(point)
                const dir = Utils.getCoordsDirection(...sub.toArray())
                if (dir !== undefined) oldNeighbours[dir] = true
            })
            neighbours = oldNeighbours
            break;
        case ITER_MODE.OPTIM2:
        default:
            neighbours = VoxelStore.instance.getNeighbours(point);
    }
    return neighbours
}

/**
 * Interface for the voxel engine to query voxels and render them,
 * without knowing the underlying storage and generation process.
 * Current implementation is using octree to store each voxels as 3D points
 */
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
            (count: number, node: any) => count + (node.data?.points?.length || 0),
            0,
        )
        return count
    }

    iterateOnVoxels(
        from: Vector3,
        to: Vector3,
        tweaks = {}
    ): Generator<AresRpgEngine.IVoxel, any, unknown> {
        const bmin = new Vector3(from.x, from.y, from.z)
        const bmax = new Vector3(to.x - 1, to.y - 1, to.z - 1)
        const bbox = new Box3(bmin, bmax)
        const iter = new OctreeIterator(this.voxelsOctree, bbox)
        VoxelStore.bbox = bbox
        const { voxelsOctree } = this

        function* makeGenerator() {
            let result: any = iter.next()
            let count = 0
            while (!result.done) {
                if (result.value.data) {
                    const pointOctant: any = result.value
                    const points = pointOctant.data?.points || []
                    for (const point of points) {
                        // find voxel neighbours
                        const neighbours = getNeighbours(point, voxelsOctree, tweaks.iterMode)
                        const { x, y, z } = point
                        const voxel: AresRpgEngine.IVoxel = {
                            position: {
                                x,
                                y,
                                z,
                            },
                            // oldNeighbours,
                            neighbours,
                            materialId: Utils.getVoxelTypeFromHeight(y),
                        }
                        if (!VoxelStore.instance.exists(point)) {
                            console.log("VOXEL DOESNT EXIST")
                        }
                        // const oldNeighboursCount = Object.keys(neighbours).length
                        // const neighboursCount2 = Object.keys(neighbours2).length
                        // if (neighboursCount !== neighboursCount2) {
                        //     console.log("NEIGHBOURS COUNT MISMATCH")
                        // }
                        // console.log("iter")
                        if (
                            voxel.position.x >= from.x &&
                            voxel.position.x < to.x &&
                            voxel.position.y >= from.y &&
                            voxel.position.y < to.y &&
                            voxel.position.z >= from.z &&
                            voxel.position.z < to.z
                        ) {
                            count++;
                            yield voxel
                        }
                    }
                }
                result = iter.next()
            }
        }
        return makeGenerator()
    }

    voxelExists(x: number, y: number, z: number): boolean {
        // console.warn("[VoxelMap::voxelExists] now deprecated")
        const point = new Vector3(x, y, z)
        const exists = !!this.voxelsOctree.findPoints(point, 0.001).length
        return exists
    }
}
