import { Vector2, Box2, Vector3, Box3 } from 'three'
import { asVect2, asVect3, getPatchId, patchUpperId } from '../common/utils'

/**
 * Multi purpose data container
 */
export abstract class DataContainer<T extends Uint16Array | Uint32Array> {
    bounds!: Box2
    dimensions!: Vector2
    abstract rawData: T

    constructor(bounds = new Box2()) {//, bitLength = BitLength.Uint16) {
        this.init(bounds)
        // this.rawData = getArrayConstructor(bitLength)
    }

    init(bounds: Box2) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector2())
    }

    /**
   * @param target target container to copy data to
   */
    copySubContent(subBounds: Box2): T {
        const targetDims = subBounds.getSize(new Vector2());
        const targetSize = targetDims.x * targetDims.y;
        const { bounds } = this;
        const source = this.rawData;

        // Create a new typed array of the same type as the source
        const target = new (this.rawData.constructor as { new(length: number): T })(targetSize);

        // Calculate local offsets relative to the main bounds
        const localMin = subBounds.min.clone().sub(bounds.min);
        const localMax = subBounds.max.clone().sub(bounds.min); // Corrected subtraction

        const rowLength = localMax.x - localMin.x;

        // Efficiently copy each row
        for (let yIndex = localMin.y; yIndex < localMax.y; yIndex++) {
            // inverted index to stick to current order TODO use new system
            const sourceStartIndex = this.getIndex(new Vector2(yIndex, localMin.x));
            const targetStartIndex = (yIndex - localMin.y) * rowLength;
            target.set(source.subarray(sourceStartIndex, sourceStartIndex + rowLength), targetStartIndex);
        }

        return target; // Return the copied subcontent
    }

    overrideContent(source: DataContainer<T>) {
        const target = this;
        if (source.bounds.intersectsBox(target.bounds)) {
            const overlap = target.bounds.clone().intersect(source.bounds);
            console.log(`overlapping => override content`)
            for (let x = overlap.min.x; x < overlap.max.x; x++) {
                // const globalStartPos = new Vector3(x, 0, overlap.min.y)
                const globalStartPos = new Vector3(x, 0, overlap.min.y)
                const targetLocalStartPos = target.toLocalPos(globalStartPos)
                const sourceLocalStartPos = source.toLocalPos(globalStartPos)
                let targetIndex = target.getIndex(targetLocalStartPos)
                let sourceIndex = source.getIndex(sourceLocalStartPos)
                for (let y = overlap.min.y; y < overlap.max.y; y++) {
                    const sourceVal = source.rawData[sourceIndex++]
                    if (sourceVal) {
                        target.rawData[targetIndex++] = sourceVal
                    }
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
        return localPos.y * this.dimensions.x + localPos.x;
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
