import { Vector2, Box3, Vector3 } from 'three'
import { BlockType } from '..'

import { BlockMode, ChunkId, ChunkKey } from '../utils/types'
import {
    asVect3,
    chunkBoxFromKey,
    parseChunkKey,
    serializeChunkId,
    parseThreeStub
} from '../utils/common'
import { WorldConf } from '../misc/WorldConfig'

enum ChunkAxisOrder {
    ZXY,
    ZYX,
}

export type ChunkStub = {
    chunkKey?: string
    bounds: Box3
    rawData: Uint16Array
    margin?: number
}

export type ChunkBuffer = {
    pos: Vector2,
    content: Uint16Array
}

/**
 * Low level multi-purpose data container
 */
export class ChunkContainer {
    static defaultDataEncoder = (blockType: BlockType, _blockMode?: BlockMode) => blockType || BlockType.NONE
    bounds: Box3
    extendedBounds: Box3
    dimensions: Vector3
    extendedDims: Vector3
    margin: number
    chunkKey = '' // needed for chunk export
    chunkId: ChunkId | undefined
    rawData: Uint16Array
    axisOrder: ChunkAxisOrder
    dataEncoder: (blockType: BlockType, _blockMode?: BlockMode) => number

    constructor(
        boundsOrChunkKey: Box3 | ChunkKey = new Box3(),
        margin = 0,
        axisOrder = ChunkAxisOrder.ZXY,
        customDataEncoder = ChunkContainer.defaultDataEncoder
    ) {
        //, bitLength = BitLength.Uint16) {
        const bounds =
            boundsOrChunkKey instanceof Box3
                ? boundsOrChunkKey.clone()
                : chunkBoxFromKey(boundsOrChunkKey, WorldConf.instance.defaultChunkDimensions)
        this.margin = margin
        this.bounds = bounds
        this.extendedBounds = bounds.clone().expandByScalar(margin)
        this.dimensions = bounds.getSize(new Vector3())
        this.extendedDims = this.extendedBounds.getSize(new Vector3())
        this.axisOrder = axisOrder
        const chunkId =
            typeof boundsOrChunkKey === 'string'
                ? parseChunkKey(boundsOrChunkKey)
                : null
        if (chunkId) {
            this.id = chunkId
        }
        this.rawData = new Uint16Array(
            this.extendedDims.x * this.extendedDims.y * this.extendedDims.z,
        )
        this.dataEncoder = customDataEncoder
        // this.rawData = getArrayConstructor(bitLength)
    }

    get id() {
        return this.chunkId
    }

    set id(chunkId: Vector3 | undefined) {
        this.chunkId = chunkId
        this.chunkKey = chunkId ? serializeChunkId(chunkId) : ''
    }

    get localBox() {
        const localBox = new Box3(new Vector3(0), this.dimensions.clone())
        return localBox
    }

    get localExtendedBox() {
        return this.localBox.expandByScalar(this.margin)
    }

    init(bounds: Box3) {
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector3())
        this.rawData = new Uint16Array(this.extendedDims.x * this.extendedDims.y * this.extendedDims.z)
    }

    // copy occurs only on the overlapping region of both containers
    static *iterOverlap(sourceChunk: ChunkContainer, targetChunk: ChunkContainer) {
        const adjustOverlapMargins = (overlap: Box3) => {
            const margin = Math.min(targetChunk.margin, sourceChunk.margin) || 0
            overlap.min.x -= targetChunk.bounds.min.x === overlap.min.x ? margin : 0
            overlap.min.y -= targetChunk.bounds.min.y === overlap.min.y ? margin : 0
            overlap.min.z -= targetChunk.bounds.min.z === overlap.min.z ? margin : 0
            overlap.max.x += targetChunk.bounds.max.x === overlap.max.x ? margin : 0
            overlap.max.y += targetChunk.bounds.max.y === overlap.max.y ? margin : 0
            overlap.max.z += targetChunk.bounds.max.z === overlap.max.z ? margin : 0
        }

        if (sourceChunk.bounds.intersectsBox(targetChunk.bounds)) {
            const overlap = targetChunk.bounds.clone().intersect(sourceChunk.bounds)
            adjustOverlapMargins(overlap)

            for (let { z } = overlap.min; z < overlap.max.z; z++) {
                for (let { x } = overlap.min; x < overlap.max.x; x++) {
                    const globalStartPos = new Vector3(x, overlap.min.y, z)
                    const targetLocalStartPos = targetChunk.toLocalPos(globalStartPos)
                    const sourceLocalStartPos = sourceChunk.toLocalPos(globalStartPos)
                    let targetIndex = targetChunk.getIndex(targetLocalStartPos)
                    let sourceIndex = sourceChunk.getIndex(sourceLocalStartPos)

                    for (let { y } = overlap.min; y < overlap.max.y; y++) {
                        yield ({ sourceIndex, targetIndex })
                        sourceIndex++
                        targetIndex++
                    }
                }
            }
        }
    }

    static applyMaskOnTarget(sourceMask: ChunkContainer, targetChunk: ChunkContainer) {
        const overlapIter = this.iterOverlap(sourceMask, targetChunk)
        for (const { sourceIndex, targetIndex } of overlapIter) {
            const sourceVal = sourceMask.rawData[sourceIndex]
            targetChunk.rawData[targetIndex] *= sourceVal || 0
        }
    }

    static copySourceToTarget(sourceChunk: ChunkContainer, targetChunk: ChunkContainer) {
        const overlapIter = this.iterOverlap(sourceChunk, targetChunk)
        for (const { sourceIndex, targetIndex } of overlapIter) {
            const sourceVal = sourceChunk.rawData[sourceIndex]
            if (sourceVal) {
                targetChunk.rawData[targetIndex] = sourceVal
            }
        }
    }

    /**
     *
     * @param localPos queried buffer location as Vector2 or Vector3
     * @returns buffer or block index for Vector2 or Vector3 input respectively.
     */
    getIndex(localPos: Vector2 | Vector3) {
        localPos = localPos instanceof Vector3 ? localPos : asVect3(localPos, -1)
        return (
            (localPos.z + this.margin) * this.extendedDims.x * this.extendedDims.y +
            (localPos.x + this.margin) * this.extendedDims.y +
            localPos.y + this.margin
        )
    }

    toLocalPos(pos: Vector3) {
        const origin = this.bounds.min.clone()
        return pos.clone().sub(origin)
    }

    toWorldPos(pos: Vector3) {
        const origin = this.bounds.min.clone()
        return origin.add(pos)
    }

    inLocalRange(localPos: Vector3) {
        return (
            localPos.x >= 0 &&
            localPos.x < this.dimensions.x &&
            localPos.y >= 0 &&
            localPos.y < this.dimensions.y &&
            localPos.z >= 0 &&
            localPos.z < this.dimensions.z
        )
    }

    inWorldRange(globalPos: Vector3) {
        return (
            globalPos.x >= this.bounds.min.x &&
            globalPos.x < this.bounds.max.x &&
            globalPos.y >= this.bounds.min.y &&
            globalPos.y < this.bounds.max.y &&
            globalPos.z >= this.bounds.min.z &&
            globalPos.z < this.bounds.max.z
        )
    }

    isOverlapping(bounds: Box3) {
        const nonOverlapping =
            this.bounds.max.x <= bounds.min.x ||
            this.bounds.min.x >= bounds.max.x ||
            this.bounds.max.y <= bounds.min.y ||
            this.bounds.min.y >= bounds.max.y ||
            this.bounds.max.z <= bounds.min.z ||
            this.bounds.min.z >= bounds.max.z
        return !nonOverlapping
    }

    containsPoint(pos: Vector3) {
        // return this.bounds.containsPoint(pos)
        return (
            pos.x >= this.bounds.min.x &&
            pos.y >= this.bounds.min.y &&
            pos.z >= this.bounds.min.z &&
            pos.x < this.bounds.max.x &&
            pos.y < this.bounds.max.y &&
            pos.z < this.bounds.max.z
        )
    }

    adjustInputBounds(input: Box3 | Vector3, local = false) {
        const rangeBox = input instanceof Box3 ? input : new Box3(input, input)
        const { min, max } = local ? this.localBox : this.bounds
        const rangeMin = new Vector3(
            Math.max(Math.floor(rangeBox.min.x), min.x),
            Math.max(Math.floor(rangeBox.min.y), min.y),
            Math.max(Math.floor(rangeBox.min.z), min.z),
        )
        const rangeMax = new Vector3(
            Math.min(Math.floor(rangeBox.max.x), max.x),
            Math.min(Math.floor(rangeBox.max.y), max.y),
            Math.min(Math.floor(rangeBox.max.z), max.z),
        )
        return local
            ? new Box3(rangeMin, rangeMax)
            : new Box3(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
    }

    /**
     * iterate raw data
     * @param rangeBox iteration range as global coords
     * @param skipMargin
     */
    *iterateContent(iteratedBounds?: Box3 | Vector3, skipMargin = true) {
        // convert to local coords to speed up iteration
        const localBounds = iteratedBounds
            ? this.adjustInputBounds(iteratedBounds)
            : this.localExtendedBox

        const isMarginBlock = ({ x, y, z }: { x: number; y: number; z: number }) =>
            !iteratedBounds &&
            this.margin > 0 &&
            (x === localBounds.min.x ||
                x === localBounds.max.x - 1 ||
                y === localBounds.min.y ||
                y === localBounds.max.y - 1 ||
                z === localBounds.min.z ||
                z === localBounds.max.z - 1)

        let index = 0
        for (let { z } = localBounds.min; z < localBounds.max.z; z++) {
            for (let { x } = localBounds.min; x < localBounds.max.x; x++) {
                for (let { y } = localBounds.min; y < localBounds.max.y; y++) {
                    const localPos = new Vector3(x, y, z)
                    if (!skipMargin || !isMarginBlock(localPos)) {
                        index = iteratedBounds ? this.getIndex(localPos) : index
                        const rawData = this.rawData[index]
                        const res = {
                            pos: this.toWorldPos(localPos),
                            localPos,
                            index,
                            rawData,
                        }
                        yield res
                    }
                    index++
                }
            }
        }
    }

    encodeSectorData(sectorData: number) {
        return sectorData
    }

    decodeSectorData(sectorData: number) {
        return sectorData
    }

    readSector(sectorIndex: number) {
        // const sectorIndex = this.getIndex(this.toLocalPos(pos))
        const rawData = this.rawData[sectorIndex] as number
        return this.decodeSectorData(rawData)
    }

    writeBlockData(sectorIndex: number, blockType: BlockType, blockMode = BlockMode.DEFAULT) {
        // const sectorIndex = this.getIndex(this.toLocalPos(pos))
        this.rawData[sectorIndex] = this.dataEncoder(blockType, blockMode)
    }

    readBuffer(localPos: Vector2) {
        const buffIndex = this.getIndex(localPos)
        const rawBuffer = this.rawData.slice(
            buffIndex,
            buffIndex + this.extendedDims.y,
        )
        return rawBuffer
    }

    writeBuffer(localPos: Vector2, buffer: Uint16Array) {
        const buffIndex = this.getIndex(localPos)
        this.rawData.set(buffer, buffIndex)
    }

    fromStub(chunkStub: ChunkStub) {
        const { chunkKey } = chunkStub
        this.init(parseThreeStub(chunkStub.bounds) as Box3)
        this.chunkId = chunkKey?.length && chunkKey?.length > 0 ? parseChunkKey(chunkKey) : this.chunkId
        this.rawData.set(chunkStub.rawData)
        return this
    }

    toStub() {
        const { chunkKey, bounds, rawData, margin } = this
        const chunkStub = { chunkKey, bounds, rawData, margin }
        return chunkStub
    }

    static fromStub(chunkStub: ChunkStub) {
        const { chunkKey, bounds, rawData, margin } = chunkStub
        const chunk = new ChunkContainer(chunkKey || parseThreeStub(bounds), margin)
        chunk.rawData.set(rawData)
        return chunk
    }

    // abstract get chunkIds(): ChunkId[]
    // abstract toChunks(): any
}
