import { Vector2, Box2, Box3, Vector3, MathUtils } from 'three'
import { ChunkId, ChunkKey } from '../common/types'
import { asVect3, chunkBoxFromKey, parseChunkKey, serializeChunkId } from '../common/utils'
import { WorldConf } from '../misc/WorldConfig'

enum ChunkAxisOrder {
    ZXY,
    ZYX
}

/**
 * Low level multi-purpose data container
 */
export class ChunkContainer {
    bounds: Box3
    dimensions: Vector3
    margin = 0
    chunkKey = '' // needed for chunk export
    chunkId: ChunkId | undefined
    rawData: Uint16Array
    axisOrder: ChunkAxisOrder

    constructor(boundsOrChunkKey: Box3 | ChunkKey = new Box3(), margin = 0, axisOrder = ChunkAxisOrder.ZXY) {
        //, bitLength = BitLength.Uint16) {
        const bounds =
            boundsOrChunkKey instanceof Box3
                ? boundsOrChunkKey.clone()
                : chunkBoxFromKey(boundsOrChunkKey, WorldConf.defaultChunkDimensions)
        this.bounds = bounds
        this.dimensions = bounds.getSize(new Vector3())
        this.rawData = new Uint16Array(this.extendedDims.x * this.extendedDims.y * this.extendedDims.z)
        this.margin = margin
        this.axisOrder = axisOrder
        const chunkId =
            typeof boundsOrChunkKey === 'string'
                ? parseChunkKey(boundsOrChunkKey)
                : null
        if (chunkId) {
            this.id = chunkId
        }
        // this.rawData = getArrayConstructor(bitLength)
    }

    get id() {
        return this.chunkId
    }

    set id(chunkId: Vector3 | undefined) {
        this.chunkId = chunkId
        this.chunkKey = serializeChunkId(chunkId)
    }

    get extendedBounds() {
        return this.bounds.clone().expandByScalar(this.margin)
    }

    get extendedDims() {
        return this.extendedBounds.getSize(new Vector3())
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
    }

    // copy occurs only on the overlapping region of both containers
    static copySourceToTarget(sourceChunk: ChunkContainer, targetChunk: ChunkContainer){
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
                        const sourceVal = sourceChunk.rawData[sourceIndex]
                        if (sourceVal) {
                            targetChunk.rawData[targetIndex] = sourceVal
                        }
                        sourceIndex++
                        targetIndex++
                    }
                }
            }
        }
    }
    /**
     * 
     * @param localPos queried buffer location as Vector2 or Vector3
     * @returns buffer or block index for Vector2 and Vector3 input types, respectively.
     */
    getIndex(localPos: Vector2 | Vector3) {
        localPos = localPos instanceof Vector3 ? localPos : asVect3(localPos)
        return localPos.z * this.dimensions.x * this.dimensions.y + localPos.x * this.dimensions.y + localPos.y
    }

    getLocalPosFromIndex(index: number) {
        // const xy = this.dimensions.x*this.dimensions.y
        // const z = Math.floor(index / xy)
        // const x = Math.floor((index-z) / this.dimensions.y) 
        // const y = index % this.dimensions.x
        // return new Vector3(x, y, z)
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

        const isMarginBlock = ({ x, y, z }: { x: number; y: number, z: number }) =>
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

    readSector(pos: Vector3) {
        const sectorIndex = this.getIndex(this.toLocalPos(pos))
        const rawData = this.rawData[sectorIndex] as number
        return this.decodeSectorData(rawData)
    }

    writeSector(pos: Vector3, sectorData: number) {
        const sectorIndex = this.getIndex(this.toLocalPos(pos))
        this.rawData[sectorIndex] = this.encodeSectorData(sectorData)
    }

    readBuffer(localPos: Vector2) {
        const buffIndex = this.getIndex(localPos)
        const rawBuffer = this.rawData.slice(buffIndex, buffIndex + this.dimensions.y)
        return rawBuffer
    }

    writeBuffer(
        localPos: Vector2,
        buffer: Uint16Array,
    ) {
        const buffIndex = this.getIndex(localPos)
        this.rawData.set(buffer, buffIndex)
    }

    // abstract get chunkIds(): ChunkId[]
    // abstract toChunks(): any
}
