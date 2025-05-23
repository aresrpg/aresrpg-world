import { Vector2, Box3, Vector3 } from 'three'

import { BlockType, ChunkId, ChunkKey } from '../utils/common_types.js'
import { asVect3, asChunkBounds, parseChunkKey, serializeChunkId, parseThreeStub, asVect2 } from '../utils/patch_chunk.js'
import { concatData, deconcatData } from '../utils/chunk_utils.js'

import { BlockDataAdapter, ChunkDataAdapter, IdenticalBoolAdapter } from './BlockDataAdapter.js'

enum ChunkAxisOrder {
    ZXY,
    ZYX,
}

export type ChunkMetadata = {
    chunkKey?: string
    bounds: Box3
    margin?: number
    // isEmpty?: boolean
}

export type EmptyChunkStub = {
    metadata: ChunkMetadata
}

export type ChunkStub<T extends ChunkMetadata> = {
    metadata: T
    rawdata: Uint16Array
}

export type DataChunkStub = ChunkStub<ChunkMetadata>

export type ChunkHeightBuffer<DataType> = {
    pos: Vector2
    content: DataType[]
}

export type ChunkHeightRawBuffer = {
    pos: Vector2
    content: Uint16Array
}

type ChunkEmptyIteration<PosFormat> = {
    pos: PosFormat
    localPos: PosFormat
    index: number
}

type ChunkRawDataIteration<PosFormat> = ChunkEmptyIteration<PosFormat> & {
    rawData: number
}

type ChunkDataIteration<PosFormat, DataType> = ChunkEmptyIteration<PosFormat> & {
    data: DataType
}

type ChunkHeightRawBufferIteration = ChunkEmptyIteration<Vector2> & ChunkHeightRawBuffer
type ChunkHeightBufferIteration<DataType> = ChunkEmptyIteration<Vector2> & ChunkHeightBuffer<DataType>

/**
 * Base chunk container with no data
 */
export class ChunkContainer {
    bounds = new Box3()
    extendedBounds = new Box3()
    dimensions = new Vector3()
    extendedDims = new Vector3()
    margin: number
    chunkKey = '' // needed for chunk export
    chunkId: ChunkId | undefined
    axisOrder: ChunkAxisOrder

    constructor(bounds?: Box3, margin = 0, axisOrder = ChunkAxisOrder.ZXY) {
        this.margin = margin
        this.axisOrder = axisOrder
        bounds && this.adjustBounds(bounds)
        // this.rawData = getArrayConstructor(bitLength)
    }

    get id() {
        return this.chunkId
    }

    set id(chunkId: ChunkId | undefined) {
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

    adjustBounds(bounds: Box3) {
        this.bounds = bounds
        this.extendedBounds = bounds.clone().expandByScalar(this.margin)
        this.dimensions = bounds.getSize(new Vector3())
        this.extendedDims = this.extendedBounds.getSize(new Vector3())
    }

    /**
     *
     * @param localPos queried buffer location as Vector2 or Vector3
     * @returns buffer or block index for Vector2 or Vector3 input respectively.
     */
    getIndex(localPos: Vector2 | Vector3) {
        localPos = localPos instanceof Vector3 ? localPos : asVect3(localPos, -this.margin)
        const index =
            (localPos.z + this.margin) * this.extendedDims.x * this.extendedDims.y +
            (localPos.x + this.margin) * this.extendedDims.y +
            localPos.y +
            this.margin
        return index
    }

    toLocalPos(pos: Vector3) {
        const origin = this.bounds.min.clone()
        return pos.clone().sub(origin)
    }

    toWorldPos(pos: Vector3) {
        const origin = this.bounds.min.clone()
        return origin.add(pos)
    }

    toPatchLocalPos(pos: Vector2) {
        const origin = asVect2(this.bounds.min)
        return pos.clone().sub(origin)
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
        return local ? new Box3(rangeMin, rangeMax) : new Box3(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
    }

    /**
     * iterate raw data
     * @param rangeBox iteration range as global coords
     * @param skipMargin
     */
    *iterateContent(iteratedBounds?: Box3 | Vector3, skipMargin = true) {
        // convert to local coords to speed up iteration
        const localBounds = iteratedBounds ? this.adjustInputBounds(iteratedBounds) : this.localExtendedBox

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
                        // const rawData = this.rawData[index]
                        const res: ChunkEmptyIteration<Vector3> = {
                            pos: this.toWorldPos(localPos),
                            localPos,
                            index,
                            // rawData,
                        }
                        yield res
                    }
                    index++
                }
            }
        }
    }

    /**
     * iterate raw data
     * @param rangeBox iteration range as global coords
     * @param skipMargin
     */
    *iterHeightBuffers(iteratedBounds?: Box3 | Vector3) {
        // convert to local coords to speed up iteration
        const localBounds = iteratedBounds ? this.adjustInputBounds(iteratedBounds) : this.localExtendedBox

        for (let { z } = localBounds.min; z < localBounds.max.z; z++) {
            for (let { x } = localBounds.min; x < localBounds.max.x; x++) {
                const buffLocPos = new Vector2(x, z)
                const buffIndex = this.getIndex(buffLocPos)
                const res: ChunkEmptyIteration<Vector2> = {
                    pos: asVect2(this.toWorldPos(asVect3(buffLocPos))),
                    localPos: buffLocPos,
                    index: buffIndex,
                }
                yield res
            }
        }
    }

    fromStub(chunkStub: EmptyChunkStub) {
        const { chunkKey, margin } = chunkStub.metadata
        const bounds = parseThreeStub(chunkStub.metadata.bounds) as Box3
        this.chunkKey = chunkKey || this.chunkKey
        this.chunkId = parseChunkKey(this.chunkKey)
        this.margin = margin || this.margin
        this.adjustBounds(bounds)
        return this
    }

    toStub() {
        const { chunkKey, bounds, margin } = this
        const metadata = { chunkKey, bounds, margin }
        const chunkStub: EmptyChunkStub = { metadata }
        // const chunkStub: ChunkStub = { chunkKey, bounds, rawData, margin, isEmpty }
        return chunkStub
    }

    fromKey(chunkKey: ChunkKey, chunkDim: Vector3) {
        const chunkBounds = asChunkBounds(chunkKey, chunkDim)
        this.adjustBounds(chunkBounds)
        this.chunkKey = chunkKey
        this.id = parseChunkKey(chunkKey)
        return this
    }

    // iteration occurs only on the overlapping region of both containers
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
                        yield { sourceIndex, targetIndex }
                        sourceIndex++
                        targetIndex++
                    }
                }
            }
        }
    }
}

/**
 * Read only container sharing its data with another to avoid costly data copy operations
 */
export abstract class ChunkSharedContainer<BlockData> extends ChunkContainer {
    static defaultDataAdapter = new ChunkDataAdapter() as BlockDataAdapter<any>
    protected abstract readonly rawData: Uint16Array<ArrayBufferLike>
    isEmpty?: boolean
    abstract dataAdapter: BlockDataAdapter<BlockData>

    constructor(bounds?: Box3, margin = 0, axisOrder = ChunkAxisOrder.ZXY) {
        super(bounds, margin, axisOrder)
    }

    isEmptySafe() {
        if (this.isEmpty !== undefined) return this.isEmpty
        // console.warn(
        //   `caution: isEmpty flag unset, fallback to compute intensive chunk emptyness check`,
        // )
        return this.rawData.reduce((sum, val) => sum + val, 0) === 0
    }

    readRawSector(sectorIndex: number) {
        // const sectorIndex = this.getIndex(this.toLocalPos(pos))
        const rawData = this.rawData[sectorIndex] as number
        return rawData
    }

    readBlockData(sectorIndex: number) {
        // const sectorIndex = this.getIndex(this.toLocalPos(pos))
        const rawData = this.rawData[sectorIndex] as number
        return this.dataAdapter.decode(rawData)
    }

    readRawBuffer(localPos: Vector2) {
        const buffIndex = this.getIndex(localPos)
        const rawBuffer = this.rawData.slice(buffIndex, buffIndex + this.extendedDims.y)
        return rawBuffer
    }

    readBlocksBuffer(localPos: Vector2) {
        const buffIndex = this.getIndex(localPos)
        const rawBuffer = this.rawData.slice(buffIndex, buffIndex + this.extendedDims.y)
        const data: BlockData[] = []
        rawBuffer.forEach(rawData => data.push(this.dataAdapter.decode(rawData)))
        return data
    }

    *iterateRawContent(iteratedBounds?: Box3 | Vector3, skipMargin?: boolean) {
        for (const { index, pos, localPos } of super.iterateContent(iteratedBounds, skipMargin)) {
            const rawData = this.rawData[index]
            if (rawData !== undefined) {
                const res: ChunkRawDataIteration<Vector3> = {
                    pos,
                    localPos,
                    index,
                    rawData,
                }
                yield res
            }
        }
    }

    override *iterateContent(iteratedBounds?: Box3 | Vector3, skipMargin?: boolean) {
        for (const { index, pos, localPos } of super.iterateContent(iteratedBounds, skipMargin)) {
            const rawData = this.rawData[index]
            const data = this.dataAdapter.decode(rawData || 0)
            if (rawData !== undefined) {
                const res: ChunkDataIteration<Vector3, BlockData> = {
                    pos,
                    localPos,
                    index,
                    data,
                }
                yield res
            }
        }
    }

    override *iterHeightBuffers(iteratedBounds?: Box3 | Vector3) {
        for (const { index, pos, localPos } of super.iterHeightBuffers(iteratedBounds)) {
            const buffData = this.readRawBuffer(localPos)

            const res: ChunkHeightRawBufferIteration = {
                pos,
                localPos,
                index,
                content: buffData,
            }
            yield res
        }
    }

    *iterBlocksHeightBuffers(iteratedBounds?: Box3 | Vector3) {
        for (const { index, pos, localPos } of super.iterHeightBuffers(iteratedBounds)) {
            const blocksData = this.readBlocksBuffer(localPos)

            const res: ChunkHeightBufferIteration<BlockData> = {
                pos,
                localPos,
                index,
                content: blocksData,
            }
            yield res
        }
    }

    copyContentToTarget(targetChunk: ChunkDataContainer<BlockData>, skipEmpty = true) {
        const overlapIter = ChunkContainer.iterOverlap(this, targetChunk)
        for (const { sourceIndex, targetIndex } of overlapIter) {
            const sourceVal = this.rawData[sourceIndex]
            const skipped = sourceVal === undefined || (skipEmpty && sourceVal === BlockType.NONE)
            if (!skipped) {
                targetChunk.rawData[targetIndex] = sourceVal
            }
        }
    }

    override toStub() {
        const { metadata } = super.toStub()
        const stub: DataChunkStub = {
            metadata,
            rawdata: this.rawData,
        }
        return stub
    }
}

/**
 * Writeable container owning its data
 */
export abstract class ChunkDataContainer<BlockData> extends ChunkSharedContainer<BlockData> {
    override rawData: Uint16Array<ArrayBufferLike> = new Uint16Array(this.dataSize)

    get dataSize() {
        return this.extendedDims.x * this.extendedDims.y * this.extendedDims.z
    }

    writeRawSector(localPos: Vector3, rawVal: number) {
        const buffIndex = this.getIndex(localPos)
        this.rawData[buffIndex] = rawVal
    }

    writeBlockData(localPos: Vector3, blockData: BlockData) {
        const buffIndex = this.getIndex(localPos)
        const rawVal = this.dataAdapter.encode(blockData)
        this.rawData[buffIndex] = rawVal
        return rawVal
    }

    writeRawBuffer(localPos: Vector2, buffer: Uint16Array) {
        const buffIndex = this.getIndex(localPos)
        this.rawData.set(buffer, buffIndex)
    }

    writeBlocksBuffer(localPos: Vector2, buffer: BlockData[]) {
        const buffIndex = this.getIndex(localPos)
        const rawBuffer = new Uint16Array(buffer.map(data => this.dataAdapter.encode(data)))
        this.rawData.set(rawBuffer, buffIndex)
    }

    override fromKey(chunkKey: ChunkKey, chunkDim: Vector3) {
        super.fromKey(chunkKey, chunkDim)
        this.rawData = new Uint16Array(this.dataSize)
        return this
    }

    override fromStub({ metadata, rawdata }: DataChunkStub) {
        const { chunkKey, margin } = metadata
        const bounds = parseThreeStub(metadata.bounds) as Box3
        this.chunkKey = chunkKey || this.chunkKey
        this.chunkId = parseChunkKey(this.chunkKey)
        this.margin = margin || this.margin
        this.adjustBounds(bounds)
        if (rawdata) {
            this.rawData = new Uint16Array(this.dataSize)
            this.rawData.set(rawdata)
        } else {
            console.warn(
                'could not initialize ChunkDataContainer properly: raw data missing. If this is an empty chunk, use ChunkContainer instead',
            )
        }
        return this
    }

    override toStub() {
        const isEmpty = this.isEmptySafe()
        const { chunkKey, bounds, margin, rawData } = this
        const metadata = { chunkKey, bounds, margin, isEmpty }
        const chunkStub: DataChunkStub = {
            metadata,
            rawdata: rawData,
        }
        // const chunkStub: ChunkStub = { chunkKey, bounds, rawData, margin, isEmpty }
        return chunkStub
    }

    fromStubConcat(concatData: Uint8Array) {
        const [metadataContent, rawdataContent] = deconcatData(concatData)
        if (metadataContent && rawdataContent) {
            const metadata = JSON.parse(new TextDecoder().decode(metadataContent))
            const rawdata = new Uint16Array(rawdataContent?.buffer || [])
            const stub: DataChunkStub = { metadata, rawdata }
            return this.fromStub(stub)
        }
        return null
    }

    toStubConcat() {
        const { metadata, rawdata } = this.toStub()
        const metadataContent = new TextEncoder().encode(JSON.stringify(metadata))
        const rawdataContent = new Uint8Array(rawdata.buffer)
        const dataConcat = concatData([metadataContent, rawdataContent])
        return dataConcat
    }

    async fromCompressedBlob(compressedBlob: Blob) {
        try {
            // decompress
            const decompStream = compressedBlob.stream().pipeThrough(new DecompressionStream('gzip'))
            const rawDecompressedData = await new Response(decompStream).arrayBuffer()
            // deconcat
            const [metadataContent, rawdataContent] = deconcatData(new Uint8Array(rawDecompressedData))
            const metadata = JSON.parse(new TextDecoder().decode(metadataContent))
            const rawdata = rawdataContent && rawdataContent.byteLength > 0 ? new Uint16Array(rawdataContent.buffer) : new Uint16Array(0) // Ensure empty rawdata if not provided
            // repopulate object
            const stub: DataChunkStub = { metadata, rawdata }
            return this.fromStub(stub)
        } catch (error) {
            console.error('Error occured during blob decompression:', error)
            throw new Error('Failed to process the compressed blob')
        }
    }

    async toCompressedBlob() {
        const stubConcat: Uint8Array = this.toStubConcat()
        // eslint-disable-next-line no-undef
        const stubConcatBlob = new Blob([stubConcat.buffer as BlobPart])
        const compressionStream = stubConcatBlob.stream().pipeThrough(new CompressionStream('gzip'))
        const compressedBlob = await new Response(compressionStream).blob()
        return compressedBlob
    }

    /**
     * merge spared chunks into unique container
     */
    fromMergedChunks(sourceChunks: ChunkSharedContainer<BlockData>[]) {
        const bounds = new Box3()
        for (const sourceChunk of sourceChunks) {
            bounds.union(sourceChunk.bounds)
        }
        this.adjustBounds(bounds)
        this.rawData = new Uint16Array(this.extendedDims.x * this.extendedDims.y * this.extendedDims.z)
        for (const sourceChunk of sourceChunks) {
            sourceChunk.copyContentToTarget(this)
        }
        return this
    }
}

export class ChunkMask extends ChunkDataContainer<boolean> {
    override dataAdapter = new IdenticalBoolAdapter()
    applyMaskOnTargetChunk(targetChunk: ChunkDataContainer<any>) {
        const overlapIter = ChunkDataContainer.iterOverlap(this, targetChunk)
        for (const { sourceIndex, targetIndex } of overlapIter) {
            const sourceVal = this.rawData[sourceIndex]
            if (targetChunk.rawData[targetIndex]) targetChunk.rawData[targetIndex] *= sourceVal || 0
        }
    }
}
