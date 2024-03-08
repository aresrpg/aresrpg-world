import { Vector3 } from "three";
import * as Utils from '../common/utils'
import { AresRpgEngine } from '@aresrpg/aresrpg-engine'

const NeighbourTypes = [...Array(26).keys()]

/**
 * Using an array to store voxel presence
 */
export class VoxelStore {
    static singleton: VoxelStore

    array: boolean[] = [];
    size: Vector3
    constructor() {
        console.log(`[VoxelStore] construct`)
        VoxelStore.singleton = this
    }
    // static instances: any = {}
    static get instance() {
        return VoxelStore.singleton || new VoxelStore()
    }

    getIndex(pos: Vector3): number {
        const { size } = this
        const index = pos.x * size.z * size.y + pos.z * size.y + pos.y
        return index
    }

    exists(pos: Vector3): boolean {
        if (pos.x >= 0 && pos.y >= 0 && pos.z >= 0) {
            const index = this.getIndex(pos)
            return this.array[index]
        }
        return false
    }

    getNeighbours(pos: Vector3, typesOnly = true) {
        const neighbours = {}
        NeighbourTypes.forEach(type => {
            const neighbour = Utils.getNeighbour(pos, type)
            if (this.exists(neighbour)) neighbours[type] = typesOnly || neighbour
        })
        return neighbours
    }
}