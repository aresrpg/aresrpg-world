import { Vector3, MathUtils, Box2, Vector2 } from "three"
import { BlockMode, WorldComputeProxy } from ".."
import { ChunkContainer, ChunkBuffer } from "../datacontainers/ChunkContainer"
import { parseGroundFlags, GroundPatch } from "../datacontainers/GroundPatch"
import { LinkedList } from "../datacontainers/LinkedList"
import { ItemType, ItemsInventory } from "../misc/ItemsInventory"
import { WorldConf } from "../misc/WorldConfig"
import { BlockType, Biome, BiomeType } from "../procgen/Biome"
import { asVect2, asVect3, serializeChunkId } from "./common"
import { PatchBlock } from "./types"

export const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
    return WorldConf.instance.debug.patch.borderHighlightColor &&
        (localPos.x === 1 || localPos.z === 1)
        ? WorldConf.instance.debug.patch.borderHighlightColor
        : blockType
}

async function* itemsOtfGen(overgroundItems: Record<ItemType, Vector3[]>) {
    for await (const [item_type, spawn_places] of Object.entries(overgroundItems)) {
        for await (const spawnOrigin of spawn_places) {
            const itemChunk = await ItemsInventory.getInstancedChunk(
                item_type,
                spawnOrigin,
            )
            yield itemChunk
        }
    }
}

export const bakeItemsIndividualChunks = async (patchBounds: Box2) => {
    // request all items belonging to this patch
    const overgroundItems = await WorldComputeProxy.current.queryOvergroundItems(patchBounds)
    // generate chunk for each item
    const itemsChunks = []
    const items_otf_gen = itemsOtfGen(overgroundItems)
    for await (const itemChunk of items_otf_gen) {
        itemChunk && itemsChunks.push(itemChunk)
    }
    return itemsChunks
}

/**
 * Creates all chunks belonging to specific patch
 * @param groundLayer 
 * @param overgroundItems 
 */
const createChunkListFromPatch = (groundLayer: GroundPatch, overgroundItems: Record<ItemType, Vector3[]>) => {
    const { yMinId, yMaxId } = WorldConf.instance.chunkSettings.genRange

    const chunks: ChunkContainer[] = []
    for (let y = yMinId; y <= yMaxId; y++) {
        const chunkId = asVect3(groundLayer.id as Vector2, y)
        const chunkKey = serializeChunkId(chunkId)
        const chunk = new ChunkContainer(chunkKey, 1)
        chunks.push(chunk)
    }
    const chunkList = LinkedList.fromArray<ChunkContainer>(chunks)
    return chunkList
}