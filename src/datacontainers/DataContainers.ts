import { Vector2, Box2, Vector3 } from 'three'
import { asVect2, asVect3, getPatchId, patchUpperId } from '../common/utils'

/**
 * Multi purpose data container
 */
export abstract class DataContainer<T extends Uint16Array | Uint32Array> {
    bounds!: Box2
    dimensions!: Vector2
    abstract rawData: T

    constructor(bounds = new Box2()) {//, bitLength = BitLength.Uint16) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector2())
        // this.rawData = getArrayConstructor(bitLength)
    }

    init(bounds: Box2) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector2())
    }

    // copy occurs only on the overlapping global pos region of both containers
    static copySourceOverTargetContainer(source: DataContainer, target: DataContainer) {
        const adjustOverlapMargins = (overlap: Box2) => {
            const margin = Math.min(target.margin, source.margin) || 0
            overlap.min.x -= target.bounds.min.x === overlap.min.x ? margin : 0
            overlap.min.y -= target.bounds.min.y === overlap.min.y ? margin : 0
            overlap.max.x += target.bounds.max.x === overlap.max.x ? margin : 0
            overlap.max.y += target.bounds.max.y === overlap.max.y ? margin : 0
        }

        if (source.bounds.intersectsBox(target.bounds)) {
            const overlap = target.bounds.clone().intersect(source.bounds);
            adjustOverlapMargins(overlap)
            for (let x = overlap.min.x; x < overlap.max.x; x++) {
                // const globalStartPos = new Vector3(x, 0, overlap.min.y)
                const globalStartPos = new Vector3(x, 0, overlap.min.y)
                const targetLocalStartPos = target.toLocalPos(globalStartPos)
                const sourceLocalStartPos = source.toLocalPos(globalStartPos)
                let targetIndex = target.getIndex(targetLocalStartPos)
                let sourceIndex = source.getIndex(sourceLocalStartPos)
                for (let y = overlap.min.y; y < overlap.max.y; y++) {
                    const sourceVal = source.rawData[sourceIndex]
                    if (sourceVal) {
                        target.rawData[targetIndex] = sourceVal
                    }
                    sourceIndex++
                    targetIndex++
                }
            }
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

    getIndex(localPos: Vector2 | Vector3) {
        localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
        return localPos.x * this.dimensions.y + localPos.y;
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