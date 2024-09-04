import { Vector2, Box2, Vector3 } from 'three'
import { asVect2, asVect3, getPatchId, patchUpperId } from '../common/utils'

// export enum BitLength {
//     Uint16,
//     Uint32
// }

// const getArrayConstructor = (bitLength: BitLength) => {
//     switch (bitLength) {
//         case BitLength.Uint16:
//             return Uint16Array
//         case BitLength.Uint32:
//             return Uint32Array
//     }
// }


/**
 * Multi purpose data container
 */
export abstract class DataContainer<T extends Uint16Array | Uint32Array> {
    bounds: Box2
    dimensions: Vector2
    abstract rawDataContainer: T

    constructor(bounds: Box2) {//, bitLength = BitLength.Uint16) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector2())
        // this.rawDataContainer = getArrayConstructor(bitLength)
    }

    /**
   * @param target target container to copy data to
   */
    copyContentOverTargetContainer(target: DataContainer<T>) {
        const source = this
        // const targetInput = targetBox || source.bounds
        // const target = new DataContainer<T>(targetInput)
        const localMin = target.bounds.min.clone().sub(source.bounds.min)
        const localMax = target.bounds.max.clone().sub(source.bounds.max)
        const rowLength = localMax.x - localMin.x
        const rowStartPos = localMin.clone()
        const sourceContainer = source.rawDataContainer
        const targetContainer = target.rawDataContainer
        let targetIndex = 0
        while (rowStartPos.y < localMax.y)
            for (let yRowIndex = localMin.y; yRowIndex < localMax.y; yRowIndex++) {
                // const startIndex = this.getBlockIndex(new Vector2(zRowIndex, ))
                let remaining = rowLength
                let sourceIndex = this.getIndex(asVect3(rowStartPos))
                while (remaining--) {
                    const rawVal = sourceContainer[sourceIndex] || 0
                    targetContainer[targetIndex] = rawVal
                    sourceIndex++
                    targetIndex++
                }
                rowStartPos.y++
            }
    }
    inLocalRange(localPos: Vector3 | Vector2) {
        localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
        return (
            localPos.x >= 0 &&
            localPos.x < this.dimensions.x &&
            localPos.y >= 0 &&
            localPos.y < this.dimensions.y
        )
    }

    inGlobalRange(globalPos: Vector3 | Vector2) {
        globalPos = globalPos instanceof Vector2 ? globalPos : asVect2(globalPos)
        return (
            globalPos.x >= this.bounds.min.x &&
            globalPos.x < this.bounds.max.x &&
            globalPos.y >= this.bounds.min.y &&
            globalPos.y < this.bounds.max.y
        )
    }

    getIndex(localPos: Vector3) {
        return localPos.x * this.dimensions.x + localPos.z
    }

    // toLocalPos<T = Vector2 | Vector3>(pos: T): T
    // toGlobalPos<T = Vector2 | Vector3>(pos: T): T

    toLocalPos(pos: Vector3) {
        const origin = asVect3(this.bounds.min.clone())
        return pos.clone().sub(origin)
    }

    toGlobalPos(pos: Vector3) {
        const origin = asVect3(this.bounds.min.clone())
        return origin.add(pos)
    }
    containsPoint(pos: Vector3) {
        return this.bounds.containsPoint(asVect2(pos))
        // return (
        //   blockPos.x >= this.bounds.min.x &&
        //   blockPos.z >= this.bounds.min.z &&
        //   blockPos.x < this.bounds.max.x &&
        //   blockPos.z < this.bounds.max.z
        // )
    }
    // abstract get chunkIds(): ChunkId[]
    // abstract toChunks(): any
}

/**
 * PatchesMap base class
 */
export class PatchesMapBase {
    patchDimensions: Vector2
    constructor(patchDim: Vector2) {
        this.patchDimensions = patchDim
    }

    getPatchRange(bbox: Box2) {
        const rangeMin = getPatchId(bbox.min, this.patchDimensions)
        const rangeMax = patchUpperId(bbox.max, this.patchDimensions)//.addScalar(1)
        const patchRange = new Box2(rangeMin, rangeMax)
        return patchRange
    }

    getPatchIds(bbox: Box2) {
        const patchIds = []
        const patchRange = this.getPatchRange(bbox)
        // iter elements on computed range
        const { min, max } = patchRange
        for (let { x } = min; x <= max.x; x++) {
            for (let { y } = min; y <= max.y; y++) {
                patchIds.push(new Vector2(x, y))
            }
        }
        return patchIds
    }

    getRoundedBox(bbox: Box2) {
        const { min, max } = this.getPatchRange(bbox)
        min.multiply(this.patchDimensions)
        max.multiply(this.patchDimensions)
        const extBbox = new Box2(min, max)
        return extBbox
    }
    /**
     * Merges all patches as single data container
     */
    asMergedContainer() {

    }
}
