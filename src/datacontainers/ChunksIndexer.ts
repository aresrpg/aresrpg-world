import { Vector2 } from "three";
import { WorldEnv } from "../misc/WorldEnv";
import { getBoundsAroundPos, getPatchIds, serializePatchId } from "../utils/common";
import { PatchKey } from "../utils/types";
import { ChunkContainer } from "./ChunkContainer";
import { GroundChunk, CaveChunkMask } from "./ChunkFactory";
import { ChunkSetProcessor } from "./ChunksProcessing";

enum ChunkCategory {
    Unknown,
    Empty,
    Underground,
    GroundSurface,
    Overground,
}

// type ChunkIndex = Record<ChunkKey, boolean>
type ChunkType = typeof GroundChunk | typeof CaveChunkMask//|typeof ChunkContainer
export const chunkTypeMapper: Partial<Record<ChunkCategory, ChunkType>> = {
    [ChunkCategory.Underground]: CaveChunkMask,
    [ChunkCategory.GroundSurface]: GroundChunk,
    // [ChunkCategory.Overground]: ChunkContainer
}

export class PatchIndexer<T = void> {
    patchLookup: Record<PatchKey, T> = {}

    get indexedKeys() {
        return Object.keys(this.patchLookup)
    }

    get indexedElements() {
        const items = Object.values(this.patchLookup)
        return items
    }

    // sortKeysAroundPos(patchKeys: PatchKey[], pos: Vector2) {
    //     const sortedKeys = patchKeys.map(patchKey => new PatchBase(patchKey))
    //         .sort((p1, p2) => {
    //             // const b1 = asPatchBounds(k1, patchDims)
    //             // const b2 = asPatchBounds(k2, patchDims)
    //             const c1 = p1.bounds.getCenter(new Vector2());
    //             const c2 = p2.bounds.getCenter(new Vector2())
    //             const d1 = c1.distanceTo(pos)
    //             const d2 = c2.distanceTo(pos)
    //             return d1 - d2
    //         })
    //         .map(p => p.key)
    //     return sortedKeys
    // }

    // index patch & chunk keys found within radius around pos
    getIndexingChanges(pos: Vector2, rad: number) {
        const bounds = getBoundsAroundPos(pos, rad)
        const patchKeys = getPatchIds(bounds, WorldEnv.current.patchDimensions).map(
            patchId => serializePatchId(patchId),
        )
        const newPatchKeys = patchKeys.filter(patchKey => !this.patchLookup[patchKey])
        // clear previous index and override with new patch/chunk keys
        const patchLookup: Record<PatchKey, T> = {}
        for (const patchKey of patchKeys) {
            const existing = this.patchLookup[patchKey]
            if (existing)
                patchLookup[patchKey] = existing
        }
        this.patchLookup = patchLookup
        return newPatchKeys
    }
}

export class ChunksIndexer extends PatchIndexer<ChunkSetProcessor> {
    chunkIds() {
        const chunkIds = []
        for (const chunkSet of this.indexedElements) {
            chunkIds.push(...chunkSet.chunkIds)
        }
        return chunkIds
    }

    indexElement(patchKey: PatchKey){
        const chunkSet = new ChunkSetProcessor(patchKey)
        this.patchLookup[patchKey] = chunkSet
        return chunkSet
    }

    indexElements(patchKeys: PatchKey[]) {
        const indexed = patchKeys.map(patchKey=>this.indexElement(patchKey))
        return indexed
    }
}

class ChunksGridIndexer extends ChunkContainer {
    indexingRange: {
        near: number,
        far: number
    }

    constructor(near, far) {
        super();
        this.indexingRange = { near, far }
    }

    reindexAroundPos() {

    }

    readPatchIndex(patchKey) {

    }


    readChunkIndex(chunkKey) {

    }
}

// export class WorldChunkIndexer extends PatchIndexer<ChunkIndexer> {
//     override getIndexingChanges(pos: Vector2, rad: number): string[] {
//         const createdPatchKeys = super.getIndexingChanges(pos, rad)
//         createdPatchKeys.forEach(async patchKey => {
//             const chunksGenerator = new ChunkIndexer(patchKey)
//             this.patchLookup[patchKey] = chunksGenerator
//         })
//         return createdPatchKeys
//     }
// }