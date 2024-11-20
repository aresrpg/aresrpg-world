import { Vector2 } from "three";
import { WorldConf } from "../misc/WorldConfig";
import { getBoundsAroundPos, getPatchIds, parseChunkKey, serializePatchId } from "../utils/common";
import { ChunkKey, PatchKey } from "../utils/types";
import { GroundChunk, CaveChunkMask, ChunksOTFGenerator } from "./ChunkFactory";

type BakeChunkParams = {
    processItemsIndividually: boolean,
}

const defaultBakeParams: BakeChunkParams = {
    processItemsIndividually: false
}

enum ChunkCategory {
    Unknown,
    Empty,
    Underground,
    GroundSurface,
    Overground,
}
type ChunkInfo = {
    category: ChunkCategory,
    awaitingGen: boolean
}
type ChunkIndex = Record<ChunkKey, boolean>
type ChunkType = typeof GroundChunk | typeof CaveChunkMask//|typeof ChunkContainer
export const chunkTypeMapper: Partial<Record<ChunkCategory, ChunkType>> = {
    [ChunkCategory.Underground]: CaveChunkMask,
    [ChunkCategory.GroundSurface]: GroundChunk,
    // [ChunkCategory.Overground]: ChunkContainer
}
/**
 * Chunks indexing
 */
export class WorldChunkIndexer<T = void> {
    indexed: Record<PatchKey, Record<ChunkKey, T | null>> = {}

    get patchIndexes() {
        return Object.keys(this.indexed)
    }

    get chunkIds() {
        const chunkIds = []
        for (const chunkKeys of Object.values(this.indexed)) {
            for (const chunkKey of Object.keys(chunkKeys)) {
                chunkIds.push(parseChunkKey(chunkKey))
            }
        }
        return chunkIds
    }

    get indexedChunksEntries() {
        const indexedChunksEntries = []
        for (const indexedChunks of Object.values(this.indexed)) {
            for (const chunkEntry of Object.entries(indexedChunks)) {
                indexedChunksEntries.push(chunkEntry)
            }
        }
        return indexedChunksEntries
    }

    genPatchChunkIds(patchKey: PatchKey) {
        const chunkKeys: Record<ChunkKey, T | undefined> = {}
        ChunksOTFGenerator.getChunkKeys(patchKey).forEach(chunkKey => {
            chunkKeys[chunkKey] = undefined
        })
        return chunkKeys
    }

    // index patch & chunk keys found within radius around pos
    reindexAroundPos(pos: Vector2, rad: number) {
        const bounds = getBoundsAroundPos(pos, rad)
        const patchKeys = getPatchIds(bounds, WorldConf.instance.patchDimensions).map(
            patchId => serializePatchId(patchId),
        )
        const createdPatchKeys = patchKeys.filter(patchKey => !this.indexed[patchKey])
        // clear previous index and override with new patch/chunk keys
        const indexed: Record<PatchKey, Record<ChunkKey, T | null>> = {}
        for (const patchKey of patchKeys) {
            indexed[patchKey] = this.indexed[patchKey] || this.genPatchChunkIds(patchKey)
        }
        this.indexed = indexed
        return createdPatchKeys
    }

    // async *otfRegenChunksVolume(bounds: Box3) {
    //     // filter patches within bounds
    //     const groundPatches = this.otfGroundPatchGen(asBox2(bounds));
    //     for await (const groundLayer of groundPatches) {
    //         const patchKey = groundLayer.key
    //         // bake overground as whole single chunk mergin all items or as individual chunks
    //         const overgroundChunk = new ItemsLayerChunk(groundLayer.bounds)
    //         await overgroundChunk.bake()
    //         // filter chunks within bounds
    //         const chunkKeys = this.getChunkIndexesForPatch(patchKey)
    //         for await (const chunkKey of chunkKeys) {
    //             const worldChunk = new ChunkContainer(chunkKey, 1)
    //             const chunkId = parseChunkKey(chunkKey)
    //             const chunkType = this.getChunkInfo(chunkId)?.category
    //             const skip = !chunkType || chunkType === ChunkCategory.Empty || chunkType === ChunkCategory.Overground
    //             if (!skip && worldChunk.bounds.intersectsBox(bounds)) {
    //                 // copy items to chunk container first to prevent overriding ground
    //                 ChunkContainer.copySourceToTarget(overgroundChunk, worldChunk)
    //                 const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
    //                 const cavesMask = new CaveChunkMask(chunkKey, 1)
    //                 await cavesMask.bake()
    //                 await groundSurfaceChunk.bake(groundLayer, cavesMask)
    //                 // copy ground over items at last 
    //                 ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
    //                 // }
    //                 yield worldChunk
    //             }
    //         }
    //     }
    // }
}