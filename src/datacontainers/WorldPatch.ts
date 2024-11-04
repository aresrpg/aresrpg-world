import { Box3, MathUtils, Vector3 } from "three";
import { WorldComputeProxy } from "../api/WorldComputeProxy";
import { ItemsInventory, ItemType } from "../misc/ItemsInventory";
import { highlightPatchBorders } from "../utils/chunks";
import { asVect2 } from "../utils/common";
import { PatchBlock } from "../utils/types";
import { ChunkContainer, ChunkBuffer } from "./ChunkContainer";
import { GroundPatch } from "./GroundPatch";

export class WorldPatch extends GroundPatch {
    overgroundItems: Record<ItemType, Vector3[]> = {}

    async retrieveOvergroundItems() {
        // request all entities belonging to this patch
        this.overgroundItems = await WorldComputeProxy.instance.queryOvergroundItems(this.bounds)
        // return this.overgroundItems
    }

    async *itemsChunksOtfGen() {
        for await (const [item_type, spawn_places] of Object.entries(this.overgroundItems)) {
            for await (const spawnOrigin of spawn_places) {
                const itemChunk = await ItemsInventory.getInstancedChunk(
                    item_type,
                    spawnOrigin,
                )
                yield itemChunk
            }
        }
    }

    generateGroundBuffer(block: PatchBlock, ymin: number, ymax: number) {
        const blockLocalPos = block.localPos as Vector3
        const blockType = highlightPatchBorders(blockLocalPos, block.data.type) || block.data.type
        const blockMode = block.data.mode
        // generate ground buffer
        const buffSize = MathUtils.clamp(block.data.level - ymin, 0, ymax - ymin)
        if (buffSize > 0) {
            const groundBuffer = new Uint16Array(buffSize)
            const encodedData = ChunkContainer.defaultDataEncoder(blockType, blockMode)
            groundBuffer.fill(encodedData)
            const chunkBuffer: ChunkBuffer = {
                pos: asVect2(blockLocalPos),
                buffer: groundBuffer
            }
            return chunkBuffer
        }
    }
    /**
     * OTF ground buffer generation
     */
    *groundBufferOtfGen(chunkBounds: Box3) {
        const ymin = chunkBounds.min.y
        const ymax = chunkBounds.max.y
        const blocks = this.iterBlocksQuery(undefined, false)
        for (const block of blocks) {
            const groundBuff = this.generateGroundBuffer(block, ymin, ymax)
            if (groundBuff) yield groundBuff
        }
    }
}