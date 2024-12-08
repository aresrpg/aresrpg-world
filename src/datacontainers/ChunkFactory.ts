import { Vector3, Box2, MathUtils } from "three"
import { WorldComputeProxy } from "../api/WorldComputeProxy"
import { WorldEnv } from "../misc/WorldEnv"
import { asVect2, serializePatchId, asBox3, asBox2, asPatchBounds } from "../utils/common"
import { BlockMode, ChunkKey, PatchBlock, PatchKey } from "../utils/types"
import { ChunkBuffer, ChunkContainer, ChunkMask } from "./ChunkContainer"
import { GroundPatch, parseGroundFlags } from "./GroundPatch"
import { BlockType, Biome, BiomeType } from "../procgen/Biome"
import { ItemsInventory, SpawnedItems } from "../misc/ItemsInventory"


const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
    return WorldEnv.current.debug.patch.borderHighlightColor &&
        (localPos.x === 1 || localPos.z === 1)
        ? WorldEnv.current.debug.patch.borderHighlightColor
        : blockType
}

export class GroundChunk extends ChunkContainer {

    generateGroundBuffer(block: PatchBlock, ymin: number, ymax: number) {
        const undegroundDepth = 4
        const bedrock = this.dataEncoder(BlockType.BEDROCK)
        const bedrockIce = this.dataEncoder(BlockType.ICE)
        const { biome, landscapeIndex, flags } = block.data
        const blockLocalPos = block.localPos as Vector3
        let landscapeConf = Biome.instance.mappings[biome].nth(landscapeIndex)
        const groundConf = landscapeConf.data
        const groundFlags = parseGroundFlags(flags)
        const blockType = highlightPatchBorders(blockLocalPos, groundConf.type) || groundConf.type
        const blockMode = groundFlags.boardMode ? BlockMode.CHECKERBOARD : BlockMode.REGULAR
        const groundSurface = this.dataEncoder(
            blockType,
            blockMode
        )
        const undergroundLayer = this.dataEncoder(groundConf.subtype || BlockType.BEDROCK)
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
        return
    }

    async bake(groundLayer?: GroundPatch, cavesMask?: ChunkMask) {
        const patchId = asVect2(this.chunkId as Vector3)
        const patchKey = serializePatchId(patchId)
        groundLayer = groundLayer || new GroundPatch(patchKey)
        groundLayer.isEmpty && await groundLayer.bake()

        const ymin = this.extendedBounds.min.y
        const ymax = this.extendedBounds.max.y

        const blocks = groundLayer.iterBlocksQuery(undefined, false)
        for (const block of blocks) {
            const groundBuff = this.generateGroundBuffer(block, ymin, ymax)
            if (groundBuff) {
                const chunk_buffer = this.readBuffer(groundBuff.pos)
                chunk_buffer.set(groundBuff.content)
                this.writeBuffer(groundBuff.pos, chunk_buffer)
            }
        }

        cavesMask?.applyMaskOnTargetChunk(this)
    }
}

export class EmptyChunk extends ChunkContainer {
    constructor(chunkKey: ChunkKey) {
        super(chunkKey, 1)
        this.rawData = new Uint16Array()
    }

    async bake() {

    }
}

export class ItemsChunkLayer extends ChunkContainer {
    spawnedItems!: SpawnedItems
    itemsChunks!: ChunkContainer[]

    constructor(boundsOrPatchKey: Box2 | PatchKey) {
        const patchBounds =
            boundsOrPatchKey instanceof Box2
                ? boundsOrPatchKey.clone()
                : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
        super(asBox3(patchBounds), 1);
    }

    get spawnedLocs() {
        const spawnedLocs = []
        for (const [, spawnPlaces] of Object.entries(this.spawnedItems)) {
            spawnedLocs.push(...spawnPlaces)
        }
        return spawnedLocs
    }

    async populate() {
        this.spawnedItems = this.spawnedItems || await WorldComputeProxy.current.queryOvergroundItems(asBox2(this.bounds))
        return this.spawnedItems
    }

    async bake() {
        const patchBounds = asBox2(this.bounds)
        const mergedChunkStub = await WorldComputeProxy.current.bakeItemsChunkLayer(patchBounds)
        // const chunkBounds = asBox3(patchBounds, mergedChunkStub.bounds.min.y, mergedChunkStub.bounds.max.y)
        // this.adjustChunkBounds(chunkBounds)
        // ChunkContainer.copySourceToTarget(mergedChunkStub, this)
        // this.rawData.set(mergedChunkStub.rawData)
        this.fromStub(mergedChunkStub)
    }

    async bakeAsIndividualChunks() {
        // request all items belonging to this patch
        this.itemsChunks = []
        let ymin = NaN, ymax = NaN  // compute y range
        for await (const [itemType, spawnPlaces] of Object.entries(this.spawnedItems)) {
            for await (const spawnOrigin of spawnPlaces) {
                const itemChunk = await ItemsInventory.getInstancedChunk(
                    itemType,
                    spawnOrigin,
                )
                if (itemChunk) {
                    ChunkContainer.copySourceToTarget(itemChunk, this)
                    const { min, max } = itemChunk.bounds
                    ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
                    ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
                    this.itemsChunks.push(itemChunk)
                }
            }
        }
        this.bounds.min.y = ymin
        this.bounds.max.y = ymax
        // return itemsChunks
    }
}

export class CaveChunkMask extends ChunkMask {
    async bake() {
        const chunkStub = await WorldComputeProxy.current.bakeCavesMask(this.chunkKey)
        this.fromStub(chunkStub)
    }
}

