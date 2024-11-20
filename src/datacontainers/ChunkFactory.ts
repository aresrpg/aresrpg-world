import { Vector3, Box2, Box3, Vector2, MathUtils } from "three"
import { WorldComputeProxy } from "../api/WorldComputeProxy"
import { WorldConf } from "../misc/WorldConfig"
import { bakeItemsIndividualChunks, highlightPatchBorders } from "../utils/chunks"
import { asVect2, serializePatchId, asBox3, asBox2, asVect3, parsePatchKey, serializeChunkId, parseChunkKey } from "../utils/common"
import { BlockMode, ChunkKey, PatchBlock, PatchKey } from "../utils/types"
import { ChunkBuffer, ChunkContainer, ChunkMask } from "./ChunkContainer"
import { GroundPatch, parseGroundFlags } from "./GroundPatch"
import { BoardContainer } from "./BoardContainer"
import { BlockType, Biome, BiomeType } from "../procgen/Biome"

const { genRange } = WorldConf.instance.chunkSettings

export class ChunkTemplate {
    chunkKey: ChunkKey
    groundLayer: GroundPatch
    itemsChunkLayer: ItemsChunkLayer

    constructor(chunkKey: ChunkKey, groundLayer: GroundPatch, itemsChunkLayer: ItemsChunkLayer) {
        this.chunkKey = chunkKey
        this.groundLayer = groundLayer
        this.itemsChunkLayer = itemsChunkLayer
    }
}

/**
 *on-the-fly (volatile) chunk generator 
 */
export class ChunksOTFGenerator {
    groundLayer: GroundPatch
    itemsChunkLayer: ItemsChunkLayer

    constructor(patchKey: PatchKey) {
        this.groundLayer = new GroundPatch(patchKey)
        this.itemsChunkLayer = new ItemsChunkLayer(this.groundLayer.bounds)
    }

    async init() {
        await this.groundLayer.bake()
        await this.itemsChunkLayer.bake()
    }

    get overgroundRange() {
        const overgroundRange = {
            ymin: this.itemsChunkLayer.bounds.min.y,
            ymax: this.itemsChunkLayer.bounds.max.y
        }
        return overgroundRange
    }

    get groundSurfaceRange() {
        const groundSurfaceRange = {
            ymin: this.groundLayer.valueRange.min,
            ymax: this.groundLayer.valueRange.max,
        }
        return groundSurfaceRange
    }

    get chunkKeys() {
        return ChunksOTFGenerator.getChunkKeys(this.groundLayer.key)
    }

    get emptyKeys() {
        const emptyKeys = this.chunkKeys
            .map(chunkKey => new ChunkContainer(chunkKey))
            .filter(chunk => this.isEmpty(chunk.bounds))
            .map(chunk => chunk.chunkKey)
        return emptyKeys
    }

    get groundSurfaceKeys() {
        const groundSurfaceKeys = this.chunkKeys
            .map(chunkKey => new ChunkContainer(chunkKey))
            .filter(chunk => !this.isEmpty(chunk.bounds) && !this.isUnderground(chunk.bounds))
            .map(chunk => chunk.chunkKey)
        return groundSurfaceKeys
    }

    get undegroundKeys() {
        const undegroundKeys = this.chunkKeys
            .map(chunkKey => new ChunkContainer(chunkKey))
            .filter(chunk => this.isUnderground(chunk.bounds))
            .map(chunk => chunk.chunkKey)
        return undegroundKeys
    }

    isEmpty = (chunkBounds: Box3) => chunkBounds.min.y > this.groundSurfaceRange.ymax && chunkBounds.min.y > this.overgroundRange.ymax
    isUnderground = (chunkBounds: Box3) => chunkBounds.max.y < this.groundSurfaceRange.ymin
    // isAboveSurface = (chunkBounds: Box3) => !this.isEmpty(chunkBounds) && !this.isUnderground(chunkBounds)

    /**
     * Performs chunks assembly
        - overground only: overground items
        - surface chunks: undeground + ground + overground
        - undeground only: undeground + ground
     */
    async *otfChunkGen(chunkKeys = this.chunkKeys) {
        for (const chunkKey of chunkKeys) {
            const worldChunk = new ChunkContainer(chunkKey, 1)
            if (!this.isEmpty(worldChunk.bounds)) {
                // copy items to chunk container first to prevent overriding ground
                ChunkContainer.copySourceToTarget(this.itemsChunkLayer, worldChunk)
                // if within ground surface range: fill with ground
                // if (isWithinGroundSurface(worldChunk.bounds)) {
                const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
                const cavesMask = new CaveChunkMask(chunkKey, 1)
                await cavesMask.bake()
                await groundSurfaceChunk.bake(this.groundLayer, cavesMask)
                // copy ground over items at last 
                ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
                // }
                yield worldChunk
            }
        }
    }

    static getChunkKeys(patchKey: PatchKey) {
        const { yMinId, yMaxId } = genRange
        const patchId = parsePatchKey(patchKey) as Vector2
        const chunkKeys = []
        for (let y = yMaxId; y >= yMinId; y--) {
            const chunkId = asVect3(patchId, y)
            const chunkKey = serializeChunkId(chunkId)
            chunkKeys.push(chunkKey)
        }
        return chunkKeys
    }
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
        const blockMode = groundFlags.boardMode ? BlockMode.BOARD_CONTAINER : BlockMode.DEFAULT
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

export class ItemsChunkLayer extends ChunkContainer {
    constructor(patchBounds: Box2) {
        super(asBox3(patchBounds), 1);
    }

    async bake() {
        const patchBounds = asBox2(this.bounds)
        const mergedChunkStub = await WorldComputeProxy.current.bakeOvergroundChunk(patchBounds)
        const chunkBounds = asBox3(patchBounds, mergedChunkStub.bounds.min.y, mergedChunkStub.bounds.max.y)
        // this.adjustChunkBounds(chunkBounds)
        // ChunkContainer.copySourceToTarget(mergedChunkStub, this)
        // this.rawData.set(mergedChunkStub.rawData)
        this.fromStub(mergedChunkStub)
    }

    async bakeIndividually() {
        const itemsChunksStubs = await bakeItemsIndividualChunks(asBox2(this.bounds))
        let ymin = NaN, ymax = NaN  // compute y range
        for (const itemChunk of itemsChunksStubs) {
            ChunkContainer.copySourceToTarget(itemChunk, this)
            const { min, max } = itemChunk.bounds
            ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
            ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
            // ChunkContainer.copySourceToTarget(itemChunk, this)
        }
        this.bounds.min.y = ymin
        this.bounds.max.y = ymax
    }
}

export class CaveChunkMask extends ChunkMask {
    async bake() {
        const chunkStub = await WorldComputeProxy.current.bakeUndergroundCaverns(this.chunkKey)
        this.fromStub(chunkStub)
    }
}

export class BoardChunkBufferOverride extends GroundChunk {
    parentBoardContainer: BoardContainer
    constructor(chunkKey: ChunkKey, parentBoardContainer: BoardContainer) {
        super(chunkKey, 1)
        this.parentBoardContainer = parentBoardContainer
    }
    override async bake() {
        const cavesMask = new CaveChunkMask(this.chunkKey, this.margin)
        await cavesMask.bake()
        return await super.bake(undefined, cavesMask)
    }

    isWithinBoard(pos: Vector3) {
        const { thickness, radius, center } = this.parentBoardContainer.boardParams
        if (pos) {
            const heightDiff = Math.abs(pos.y - center.y)
            const dist = asVect2(pos).distanceTo(asVect2(center))
            // pos inside board
            const isInside = dist <= radius && heightDiff <= thickness
            // if (isInside) {
            //     this.boardBounds = this.boardBounds || new Box2(asVect2(blockPos), asVect2(blockPos))
            //     this.boardBounds.expandByPoint(asVect2(blockPos))
            //     return true
            // }
            return isInside
        }

        // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
        return false
    }

    genBoardMask() {
        const { center } = this.parentBoardContainer.boardParams
        const boardChunkMask = new ChunkMask(this.chunkKey, this.margin)
        boardChunkMask.rawData.fill(0)
        const chunfBuffers = this.iterChunkBuffers()
        for (const chunkBuff of chunfBuffers) {
            const buffData = chunkBuff.data.slice()
            const buffLevel = buffData.findIndex(val => val === 0)
            chunkBuff.pos.y = center.y
            if (this.isWithinBoard(chunkBuff.pos)) {
                // override buff data
                buffData.fill(1)
                boardChunkMask.writeBuffer(chunkBuff.localPos, buffData)
            }
        }
        return boardChunkMask
    }
}

