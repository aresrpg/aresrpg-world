import { Box3, Vector3, Color } from "three";
import { OctreeIterator, PointData, PointOctant, PointOctree } from "sparse-octree";
import { IVoxelMaterial, IVoxelMap, IVoxel } from "../shared/i-voxel-map";
import { ConstVec3 } from "../shared/types";

enum EVoxelType {
    ROCK,
    GRASS,
    SNOW,
    WATER,
    SAND,
}

const VOXEL_COLORS: Record<EVoxelType, IVoxelMaterial> = [
    { color: new Color("#ABABAB") },
    { color: new Color("#00B920") },
    { color: new Color("#E5E5E5") },
    { color: new Color("#0055E2") },
    { color: new Color("#DCBE28") },
];

const getVoxelTypeFromHeight = (height) => {
    if (height < 10) return EVoxelType.WATER
    else if (height < 20) return EVoxelType.SAND
    else if (height < 60) return EVoxelType.GRASS
    else if (height < 100) return EVoxelType.ROCK
    else if (height >= 100) return EVoxelType.SNOW
}

export class VoxelMap implements IVoxelMap {
    public readonly size: ConstVec3;
    voxelsOctree;
    public constructor(bbox: Box3) {
        this.size = bbox.getSize(new Vector3());
        this.voxelsOctree = new PointOctree(bbox.min, bbox.max, 0.0, 8, 8);
    }
    getAllVoxelMaterials(): IVoxelMaterial[] {
        return Object.values(VOXEL_COLORS);
    }
    getMaxVoxelsCount(from: ConstVec3, to: ConstVec3): number {
        const bmin = new Vector3(from.x, from.y, from.z);
        const bmax = new Vector3(to.x, to.y, to.z);
        const bbox = new Box3(bmin, bmax);
        const res = this.voxelsOctree.cull(bbox)
        const count = res.reduce((count, oct) => count + (oct.data?.points?.length || 0), 0)
        return count
    }
    iterateOnVoxels(from: ConstVec3, to: ConstVec3): Generator<IVoxel, any, unknown> {
        const bmin = new Vector3(from.x, from.y, from.z);
        const bmax = new Vector3(to.x - 1, to.y - 1, to.z - 1);
        const bbox = new Box3(bmin, bmax);
        const iter = new OctreeIterator(this.voxelsOctree, bbox)

        function* makeGenerator() {
            let result = iter.next();
            while (!result.done) {
                if (result.value.data) {
                    const pointOctant: PointOctant<PointData<any>> = result.value
                    const points = pointOctant.data?.points || [];
                    for (let i = 0; i < points.length; i += 1) {
                        const { x, y, z } = points[i]
                        const voxel: IVoxel = {
                            position: {
                                x,
                                y,
                                z
                            },
                            typeId: getVoxelTypeFromHeight(y)
                        }
                        // console.log("iter")
                        if (voxel.position.x >= from.x && voxel.position.x < to.x &&
                            voxel.position.y >= from.y && voxel.position.y < to.y &&
                            voxel.position.z >= from.z && voxel.position.z < to.z)
                            yield voxel
                    }
                }
                result = iter.next();
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