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

export const generateGroundBuffer = (block: PatchBlock, ymin: number, ymax: number) => {
    const undegroundDepth = 4
    const bedrock = ChunkContainer.defaultDataEncoder(BlockType.BEDROCK)
    const bedrockIce = ChunkContainer.defaultDataEncoder(BlockType.ICE)
    const { biome, landscapeIndex, flags } = block.data
    const blockLocalPos = block.localPos as Vector3
    let landscapeConf = Biome.instance.mappings[biome].nth(landscapeIndex)
    const groundConf = landscapeConf.data
    const groundFlags = parseGroundFlags(flags)
    const blockType = highlightPatchBorders(blockLocalPos, groundConf.type) || groundConf.type
    const blockMode = groundFlags.boardMode ? BlockMode.BOARD_CONTAINER : BlockMode.DEFAULT
    const groundSurface = ChunkContainer.defaultDataEncoder(
        blockType,
        blockMode
    )
    const undergroundLayer = ChunkContainer.defaultDataEncoder(groundConf.subtype || BlockType.BEDROCK)
    // generate ground buffer
    const buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
    if (buffSize > 0) {
        const groundBuffer = new Uint16Array(block.data.level - ymin)
        // fill with bedrock first
        groundBuffer.fill(biome === BiomeType.Artic ? bedrockIce : bedrock)
        // add underground layer
        groundBuffer.fill(undergroundLayer, groundBuffer.length - (undegroundDepth + 1))
        // finish with ground surface block
        groundBuffer[groundBuffer.length - 1] = groundSurface
        const chunkBuffer: ChunkBuffer = {
            pos: asVect2(blockLocalPos),
            content: groundBuffer.slice(0, buffSize)
        }
        return chunkBuffer
    }
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
    const overgroundItems = await WorldComputeProxy.instance.queryOvergroundItems(patchBounds)
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