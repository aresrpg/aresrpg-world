import { Vector2 } from "three"
import { WorldComputeProxy } from "../api/WorldComputeProxy"
import { WorldEnv } from "../misc/WorldEnv"
import { parsePatchKey, asVect3, serializeChunkId, asPatchBounds } from "../utils/common"
import { PatchKey } from "../utils/types"
import { ChunkContainer } from "./ChunkContainer"
import { EmptyChunk } from "./ChunkFactory"
const chunksRange = WorldEnv.current.chunks.range
const patchDims = WorldEnv.current.patchDimensions

/**
 * on-the-fly chunks processor 
 * Processing rules:
 * - ground surface chunks always precedes underground chunks because view distance 
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 */
export class ChunkSetProcessor {
    patchKey: PatchKey
    processingState = {
        above: false,
        below: false
    }

    constructor(patchKey: PatchKey) {
        this.patchKey = patchKey
    }

    get patchId() {
        return parsePatchKey(this.patchKey) as Vector2
    }

    get patchBounds() {
        return asPatchBounds(this.patchKey, patchDims)
    }

    get patchCenter() {
        return this.patchBounds.getCenter(new Vector2())
    }

    distanceTo(pos: Vector2) {
        return this.patchCenter.distanceTo(pos)
    }

    get chunkIds() {
        const chunksIds = []
        const { bottomId, topId } = chunksRange
        for (let y = topId; y >= bottomId; y--) {
            const chunkId = asVect3(this.patchId, y)
            chunksIds.push(chunkId)
        }
        return chunksIds
    }

    /**
     * e.g. ground surface with overground items + empty chunks
     */
    async processChunksAboveGroundSurface() {
        if (this.processingState.above) return []
        this.processingState.above = true
        const groundSurfaceChunks = await WorldComputeProxy.current.bakeSurfaceChunks(this.patchKey)
        const lastSurfaceIndex = groundSurfaceChunks.length - 1
        const surfaceRange = {
            bottom: groundSurfaceChunks[0]?.chunkId?.y || 0,
            top: groundSurfaceChunks[lastSurfaceIndex]?.chunkId?.y || 0
        }
        console.log(`processed surface chunks: ${this.printChunkset(groundSurfaceChunks)}`)
        // empty chunks start 1 chunk above ground surface
        const emptyChunks = []
        for (let y = surfaceRange.top + 1; y <= chunksRange.topId; y++) {
            const chunkId = asVect3(this.patchId, y)
            const chunkKey = serializeChunkId(chunkId)
            const emptyChunk = new EmptyChunk(chunkKey)
            emptyChunks.push(emptyChunk)
        }
        console.log(`processed empty chunks: ${this.printChunkset(emptyChunks)}`)
        return [...groundSurfaceChunks, ...emptyChunks]
    }

    /**
     * e.g. undeground chunks only
     */
    async processChunksBelowGroundSurface() {
        if (this.processingState.below) return []
        this.processingState.below = true
        // discover undeground range by making first call with patchKey
        const undegroundTopChunk = await WorldComputeProxy.current.bakeUndergroundChunk(this.patchId)
        const undegroundTopId = undegroundTopChunk.chunkId?.y || 0
        const remainingChunks = []
        // then infer remaining chunk keys and iter over them
        for await (let yId = undegroundTopId - 1; yId >= chunksRange.bottomId; yId--) {
            const chunkId = asVect3(this.patchId, yId)
            const currentChunk = await WorldComputeProxy.current.bakeUndergroundChunk(chunkId)
            remainingChunks.push(currentChunk)
        }
        const undergoundChunks = [undegroundTopChunk, ...remainingChunks]
        console.log(`processed undeground chunkset: ${this.printChunkset(undergoundChunks)}`)
        return undergoundChunks
    }

    printChunkset = (chunkset: ChunkContainer[]) => chunkset.reduce((concat, chunk) => concat + chunk.chunkKey + ', ', '')

    /**
     * Sequential chunk gen
     */
    // async *sequentialGen(chunkKeys: ChunkKey[]) {
    //     for (const chunkKey of chunkKeys) {
    //         const worldChunk = await WorldComputeProxy.current.bakeWorldChunk(chunkKey)
    //         yield worldChunk
    //     }
    // }
}