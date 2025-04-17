import { Vector2, Box2, Vector3, TypedArray } from 'three'

import { BlockType, PatchKey } from '../utils/common_types.js'
import { parsePatchKey, asPatchBounds, asVect2, parseThreeStub } from '../utils/patch_chunk.js'

import { BlockDataAdapter } from './BlockDataAdapter.js'
import { EmptyChunkStub } from './ChunkContainer.js'

// export class PatchChunkCommon<T> {

// }

export type PatchEmptyIteration = {
    pos: Vector2
    index: number
    localPos: Vector2
}

export type PatchDataIteration<DataType> = PatchEmptyIteration & {
    data: DataType
}

export type PatchMetadata = {
    patchKey?: string
    // id?: Vector2
    bounds: Box2
    margin?: number
    // isEmpty?: boolean
}

export type EmptyPatchStub = {
    metadata: PatchMetadata
}

// export type PatchDataStub<T extends TypedArray> = EmptyPatchStub & {
export type PatchDataStub = EmptyPatchStub & {
    rawdata: TypedArray
}

/**
 * Generic patch struct
 */
export class PatchContainer {
    bounds = new Box2()
    dimensions = new Vector2()
    margin = 0
    key = '' // needed for patch export
    id: Vector2 | undefined

    constructor(bounds = new Box2(), margin = 0) {
        //, bitLength = BitLength.Uint16) {
        this.init(bounds.clone())
        this.margin = margin
        // this.rawData = getArrayConstructor(bitLength)
    }

    get patchId() {
        return this.id
    }

    get patchKey() {
        return this.key
    }

    set patchKey(patchKey: string) {
        this.key = patchKey
        this.id = parsePatchKey(patchKey)
    }

    get localBox() {
        const localBox = new Box2(new Vector2(0), this.dimensions.clone())
        return localBox
    }

    init(bounds: Box2) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector2())
    }

    get extendedBounds() {
        return this.bounds.clone().expandByScalar(this.margin)
    }

    get extendedDims() {
        return this.extendedBounds.getSize(new Vector2())
    }

    get localExtendedBox() {
        return this.localBox.expandByScalar(this.margin)
    }

    inLocalRange(localPos: Vector2) {
        return localPos.x >= 0 && localPos.x < this.dimensions.x && localPos.y >= 0 && localPos.y < this.dimensions.y
    }

    inWorldRange(globalPos: Vector2) {
        return (
            globalPos.x >= this.bounds.min.x &&
            globalPos.x < this.bounds.max.x &&
            globalPos.y >= this.bounds.min.y &&
            globalPos.y < this.bounds.max.y
        )
    }

    // getIndex(localPos: Vector2) {
    //   return localPos.y * this.dimensions.x + localPos.x
    // }

    // getLocalPosFromIndex(index: number) {
    //   const y = Math.floor(index / this.dimensions.y)
    //   const x = index % this.dimensions.x
    //   return new Vector2(x, y)
    // }

    // toLocalPos<T = Vector2 | Vector3>(pos: T): T
    // toGlobalPos<T = Vector2 | Vector3>(pos: T): T

    getIndex(localPos: Vector2 | Vector3) {
        localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
        return (localPos.y + this.margin) * this.extendedDims.x + localPos.x + this.margin
    }

    getLocalPosFromIndex(index: number): Vector2 {
        const y = Math.floor(index / this.extendedDims.y) - this.margin
        const x = (index % this.extendedDims.x) - this.margin
        return new Vector2(x, y)
    }

    toLocalPos(globalPos: Vector2) {
        const origin = this.bounds.min.clone()
        return globalPos.clone().sub(origin)
    }

    toWorldPos(localPos: Vector2) {
        const origin = this.bounds.min.clone()
        return origin.add(localPos)
    }

    isOverlapping(bounds: Box2) {
        const nonOverlapping =
            this.bounds.max.x <= bounds.min.x ||
            this.bounds.min.x >= bounds.max.x ||
            this.bounds.max.y <= bounds.min.y ||
            this.bounds.min.y >= bounds.max.y
        return !nonOverlapping
    }

    containsPoint(pos: Vector2) {
        // return this.bounds.containsPoint(pos)
        return pos.x >= this.bounds.min.x && pos.y >= this.bounds.min.y && pos.x < this.bounds.max.x && pos.y < this.bounds.max.y
    }

    /**
     * by default will iterate whole patch excluding margins
     * @param globalBounds
     * @param includeMargins
     */
    *iterData(globalBounds?: Box2, includeMargins = false) {
        const wholeBounds = includeMargins ? this.extendedBounds : this.bounds

        const getOverlapBounds = (inputBounds: Box2) => {
            const { min, max } = inputBounds
            const overlapBounds = new Box2(min.clone().floor(), max.clone().floor())
            return overlapBounds.intersect(wholeBounds)
        }

        const overlapBounds = globalBounds ? getOverlapBounds(globalBounds) : wholeBounds

        const globalMin = overlapBounds.min
        const globalMax = overlapBounds.max
        const localMin = this.toLocalPos(globalMin)
        // const localMax = this.toLocalPos(globalMax)

        for (let yGlobal = globalMin.y, yLocal = localMin.y; yGlobal < globalMax.y; yGlobal++, yLocal++) {
            for (let xGlobal = globalMin.x, xLocal = localMin.x; xGlobal < globalMax.x; xGlobal++, xLocal++) {
                const localPos = new Vector2(xLocal, yLocal)
                const globalPos = new Vector2(xGlobal, yGlobal)
                const index = this.getIndex(localPos)
                const patchElem: PatchEmptyIteration = {
                    index,
                    pos: globalPos,
                    localPos,
                }
                yield patchElem
            }
        }
    }

    fromStub(patchStub: EmptyPatchStub) {
        const { patchKey, margin } = patchStub.metadata
        const bounds = parseThreeStub(patchStub.metadata.bounds) as Box2
        this.patchKey = patchKey || this.patchKey
        // this.patchId = parsePatchKey(this.patchKey)
        this.margin = margin || this.margin
        this.init(bounds)
        return this
    }

    toStub() {
        const { bounds, margin, patchKey } = this
        const metadata = { bounds, margin, patchKey }
        const patchStub: EmptyPatchStub = {
            metadata,
        }
        return patchStub
    }

    fromKey(patchKey: PatchKey, patchDim: Vector2, patchMargin = 0) {
        const bounds = asPatchBounds(patchKey, patchDim)
        this.init(bounds)
        this.margin = patchMargin
        this.key = patchKey
        this.id = parsePatchKey(patchKey)
        return this
    }

    // abstract get chunkIds(): ChunkId[]
    // abstract toChunks(): any
}

export interface DataContainer {
    rawData: Uint8Array | Uint16Array | Uint32Array
}

// export type PatchDataContainer = PatchBase & DataContainer

export abstract class PatchDataContainer<DataType> extends PatchContainer {
    abstract rawData: TypedArray
    abstract dataAdapter: BlockDataAdapter<DataType>

    get dataSize() {
        return this.extendedDims.x * this.extendedDims.y
    }

    readData(localPos: Vector2) {
        const index = this.getIndex(localPos)
        const rawData = this.rawData[index]
        return rawData !== undefined ? this.dataAdapter.decode(rawData) : null
    }

    writeData(localPos: Vector2, blockData: DataType) {
        const index = this.getIndex(localPos)
        this.rawData[index] = this.dataAdapter.encode(blockData)
    }

    /**
     * iteration range as global coords
     * @param iterBounds
     * @param includeMargins
     */
    override *iterData(iterBounds?: Box2, includeMargins = true, skipEmpty = false) {
        const patchSectors = super.iterData(iterBounds, includeMargins)
        for (const sector of patchSectors) {
            const { index, localPos } = sector
            const blockData = this.readData(localPos)
            if (blockData || !skipEmpty) {
                const block: PatchDataIteration<DataType | null> = {
                    index,
                    pos: this.toWorldPos(localPos),
                    localPos,
                    data: blockData,
                }
                yield block
            }
        }
    }

    // copy occurs only on the overlapping global pos region of both containers
    copyContentToTarget(target: PatchDataContainer<DataType>, skipEmpty = true) {
        // const adjustOverlapMargins = (overlap: Box2) => {
        //   const margin = Math.min(target.margin, source.margin) || 0
        //   overlap.min.x -= target.bounds.min.x === overlap.min.x ? margin : 0
        //   overlap.min.y -= target.bounds.min.y === overlap.min.y ? margin : 0
        //   overlap.max.x += target.bounds.max.x === overlap.max.x ? margin : 0
        //   overlap.max.y += target.bounds.max.y === overlap.max.y ? margin : 0
        // }

        if (this.bounds.intersectsBox(target.bounds)) {
            const overlap = target.extendedBounds.clone().intersect(this.extendedBounds)
            // adjustOverlapMargins(overlap)
            for (let { y } = overlap.min; y < overlap.max.y; y++) {
                // const globalStartPos = new Vector3(x, 0, overlap.min.y)
                const globalStartPos = new Vector2(overlap.min.x, y)
                const targetLocalStartPos = target.toLocalPos(globalStartPos)
                const sourceLocalStartPos = this.toLocalPos(globalStartPos)
                let targetIndex = target.getIndex(targetLocalStartPos)
                let sourceIndex = this.getIndex(sourceLocalStartPos)
                for (let { x } = overlap.min; x < overlap.max.x; x++) {
                    const sourceVal = this.rawData[sourceIndex]
                    if (sourceVal || (!skipEmpty && sourceVal === BlockType.NONE)) {
                        target.rawData[targetIndex] = sourceVal
                    }
                    sourceIndex++
                    targetIndex++
                }
            }
        }
    }

    override toStub() {
        const { metadata } = super.toStub()
        const stub: PatchDataStub = {
            metadata,
            rawdata: this.rawData,
        }
        return stub
    }

    override fromStub({ metadata, rawdata }: PatchDataStub) {
        const { patchKey, margin } = metadata
        const bounds = parseThreeStub(metadata.bounds) as Box2
        this.patchKey = patchKey || this.patchKey
        // this.patchId = parsePatchKey(this.patchKey)
        this.margin = margin || this.margin
        this.init(bounds)
        if (rawdata) {
            this.rawData = new Uint16Array(this.dataSize)
            this.rawData.set(rawdata)
        } else {
            console.warn(
                'could not initialize PatchDataContainer properly: raw data missing. If this is an empty chunk, use ChunkContainer instead',
            )
        }
        return this
    }
}

// export type DataContainer = PatchContainer & {
//   rawData: Uint8Array | Uint16Array | Uint32Array
// }

/**
 * discrete data container
 */
export type SparseDataPatchStub<DataType> = EmptyChunkStub & {
    content: DataType[]
}

export class SparseDataPatchContainer<DataType> extends PatchContainer {
    sparseData: DataType[] = []
}
