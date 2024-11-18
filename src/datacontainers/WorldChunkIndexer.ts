import { Vector3, Vector2, Box2, Box3 } from "three";
import { WorldComputeProxy } from "../api/WorldComputeProxy";
import { WorldConf } from "../misc/WorldConfig";
import { bakeItemsIndividualChunks, generateGroundBuffer } from "../utils/chunks";
import { asVect2, asVect3, getBoundsAroundPos, getPatchIds, parseChunkKey, parsePatchKey, serializeChunkId, serializePatchId } from "../utils/common";
import { ChunkId, PatchKey } from "../utils/types";
import { ChunkContainer } from "./ChunkContainer";
import { GroundPatch } from "./GroundPatch";

type BakeChunkParams = {
    processItemsIndividually: boolean,
}

const defaultBakeParams: BakeChunkParams = {
    processItemsIndividually: false
}

const { genRange } = WorldConf.instance.chunkSettings


export class GroundChunk extends ChunkContainer {
    async bake(groundLayer?: GroundPatch) {
        const patchId = asVect2(this.chunkId as Vector3)
        const patchKey = serializePatchId(patchId)
        groundLayer = groundLayer || new GroundPatch(patchKey)
        groundLayer.isEmpty && await groundLayer.fillGroundData()
        await this.fillFromGroundLayer(groundLayer)
        await this.applyCavesMask()
    }

    async fillFromGroundLayer(groundLayer: GroundPatch) {
        const ymin = this.extendedBounds.min.y
        const ymax = this.extendedBounds.max.y

        const blocks = groundLayer.iterBlocksQuery(undefined, false)
        for (const block of blocks) {
            const groundBuff = generateGroundBuffer(block, ymin, ymax)
            if (groundBuff) {
                const chunk_buffer = this.readBuffer(groundBuff.pos)
                chunk_buffer.set(groundBuff.content)
                this.writeBuffer(groundBuff.pos, chunk_buffer)
            }
        }
    }

    async applyCavesMask() {
        // compute caverns mask
        const cavesMask = await WorldComputeProxy.current.bakeUndergroundCaverns(this.chunkKey)
        ChunkContainer.applyMaskOnTarget(cavesMask, this)
    }
}

enum ChunkCategory {
    Unknown,
    Empty,
    Underground,
    GroundSurface,
    Overground,
}
type ChunkIndex = number
type ChunkRecord = {
    category: ChunkCategory,
    awaitingGen: boolean
}
type ChunkRecords = Record<ChunkIndex, ChunkRecord>
/**
 * Chunks indexing
 */
export class WorldChunkIndexer {
    chunksLookup: Record<PatchKey, ChunkRecords> = {}
    get indexedPatchKeys() {
        return Object.keys(this.chunksLookup)
    }

    get indexedChunkKeys() {
        const indexedChunkKeys = []
        for (const patchKey of this.indexedPatchKeys) {
            for (const chunkKey of this.getPatchIndexedChunkKeys(patchKey)) {
                indexedChunkKeys.push(chunkKey)
            }
        }
        return indexedChunkKeys
    }

    getPatchIndexedChunkKeys(patchKey: PatchKey) {
        const patchId = parsePatchKey(patchKey)
        const chunkRec = this.chunksLookup[patchKey]
        return chunkRec && patchId ?
            Object.keys(chunkRec)
                .map(yId => asVect3(patchId, parseInt(yId)))
                .map(chunkId => serializeChunkId(chunkId)) : []
    }

    getIndexedChunkRef(chunkId: Vector3) {
        const patchKey = serializePatchId(asVect2(chunkId))
        return this.chunksLookup[patchKey]?.[chunkId.y]
    }

    getPatchChunkItems(patchKey: PatchKey) {
        const patchId = parsePatchKey(patchKey)
        const chunkRec = this.chunksLookup[patchKey]
        return chunkRec && patchId ?
            Object.keys(chunkRec).map(yId => asVect3(patchId, parseInt(yId))) : []
    }

    // index patch keys present within radius around pos
    reindexAroundPos(pos: Vector2, rad: number) {
        const bounds = getBoundsAroundPos(pos, rad)
        const chunksLookup: Record<PatchKey, ChunkRecords> = {}
        const patchKeys = getPatchIds(bounds, WorldConf.instance.patchDimensions).map(
            patchId => serializePatchId(patchId),
        )
        let changeDetected = false
        patchKeys.forEach(key => {
            changeDetected = changeDetected || !this.chunksLookup[key]
            chunksLookup[key] = this.chunksLookup[key] || {}
        })
        return changeDetected ? chunksLookup : null
    }

    populateChunkIndex() {
        const { yMinId, yMaxId } = genRange
        const chunkKeys: ChunkId[] = []
        for (const patchKey of this.indexedPatchKeys) {
            const patchId = parsePatchKey(patchKey) as Vector2
            for (let y = yMaxId; y >= yMinId; y--) {
                const chunkId = asVect3(patchId, y)
                const chunkKey = serializeChunkId(chunkId)
                const category = ChunkCategory.Unknown
                const patchChunks = this.chunksLookup[patchKey]
                if (patchChunks && !patchChunks[y]) {
                    patchChunks[y] = { category, awaitingGen: true }
                }
                chunkKeys.push(parseChunkKey(chunkKey))
            }
        }
        return chunkKeys
    }

    async *otfGroundPatchGen(genBounds?: Box2) {
        for await (const patchKey of this.indexedPatchKeys) {
            const groundPatch = new GroundPatch(patchKey)
            if (!genBounds || genBounds.intersectsBox(groundPatch.bounds)) {
                await groundPatch.fillGroundData()
                yield groundPatch
            }
        }
    }

    // selectFromPosRad(pos: Vector3, rad: number) {

    // }

    /**
     * Surface chunks = ground + overground
     * build surface chunks batch
     */
    async *otfGroundSurfaceChunksGen(params: BakeChunkParams = defaultBakeParams) {
        // on-the-fly ground patch gen
        const groundPatches = this.otfGroundPatchGen();
        for await (const groundLayer of groundPatches) {
            const patchKey = groundLayer.key
            // bake overground items either as whole single chunk or as individual chunks
            const overgroundChunks = params.processItemsIndividually ? await bakeItemsIndividualChunks(groundLayer.bounds) :
                [await WorldComputeProxy.current.bakeOvergroundChunk(groundLayer.bounds)]
            // compute ranges
            const overgroundRange = {
                ymin: NaN,
                ymax: NaN
            }
            for (const itemChunk of overgroundChunks) {
                const { min, max } = itemChunk.bounds
                const { ymin, ymax } = overgroundRange
                overgroundRange.ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
                overgroundRange.ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
                // ChunkContainer.copySourceToTarget(itemChunk, this)
            }
            const groundSurfaceRange = {
                ymin: groundLayer.valueRange.min,
                ymax: groundLayer.valueRange.max,
            }

            const isEmpty = (chunkBounds: Box3) => chunkBounds.min.y > groundSurfaceRange.ymax && chunkBounds.min.y > overgroundRange.ymax
            const isUnderground = (chunkBounds: Box3) => chunkBounds.max.y < groundSurfaceRange.ymin
            const isWithinOverground = (chunkBounds: Box3) => chunkBounds.min.y >= overgroundRange.ymin || chunkBounds.max.y >= overgroundRange.ymin
            // const isWithinGroundSurface = (chunkBounds: Box3) => chunkBounds.min.y >= overgroundRange.ymin
            // iter chunk keys
            const chunkKeys = this.getPatchIndexedChunkKeys(patchKey)
            for await (const chunkKey of chunkKeys) {
                const worldChunk = new ChunkContainer(chunkKey, 1)
                const chunkId = parseChunkKey(chunkKey)
                const chunkRef = this.getIndexedChunkRef(chunkId)
                if (chunkRef?.awaitingGen) {
                    // any chunk above overground is empty
                    if (isEmpty(worldChunk.bounds)) {
                        chunkRef.category = ChunkCategory.Empty
                        chunkRef.awaitingGen = false
                    }
                    // if below ground surface range mark as undeground 
                    else if (isUnderground(worldChunk.bounds)) {
                        chunkRef.category = ChunkCategory.Underground
                    }
                    // chunk is either ground surface, overground or both
                    else {
                        // within overground range:
                        if (isWithinOverground(worldChunk.bounds)) {
                            // copy each individual items to chunk container first 
                            // so they don't override ground later
                            for (const itemChunk of overgroundChunks) {
                                ChunkContainer.copySourceToTarget(itemChunk, worldChunk)
                            }
                        }
                        // if within ground surface range: fill with ground
                        // if (isWithinGroundSurface(worldChunk.bounds)) {
                        const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
                        await groundSurfaceChunk.bake(groundLayer)
                        // copy ground over items at last 
                        ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
                        // }
                        chunkRef.category = ChunkCategory.GroundSurface
                        chunkRef.awaitingGen = false
                        yield worldChunk
                    }
                }
            }
        }
    }

    /**
     * Undeground chunks below ground surface
     */
    async *otfUndegroundChunksGen(genBounds?: Box2) {
        // iter over patch keys
        const groundPatches = this.otfGroundPatchGen(genBounds);
        for await (const groundLayer of groundPatches) {
            const patchKey = groundLayer.key
            const chunkKeys = this.getPatchIndexedChunkKeys(patchKey)
            for await (const chunkKey of chunkKeys) {
                const chunkid = parseChunkKey(chunkKey)
                const chunkRef = this.getIndexedChunkRef(chunkid)
                if (chunkRef?.awaitingGen && chunkRef?.category === ChunkCategory.Underground) {
                    const undergroundChunk = new GroundChunk(chunkKey, 1)
                    await undergroundChunk.bake(groundLayer)
                    chunkRef.awaitingGen = false
                    yield undergroundChunk
                }
            }
        }
    }
}


/**
 * WorldChunk on-the-fly generator (won't keep data in memory)
 */
export class WorldChunkOTFGen { }
