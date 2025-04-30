// import { MathUtils, Vector3 } from 'three'
import { Vector2, Vector3 } from 'three'

import { asVect2, serializePatchId, asBox2, asVect3 } from '../utils/patch_chunk.js'
import {
    BlockData,
    BlockType,
    BiomeType,
    SpawnType,
    SpawnCategory,
    PatchGroundBlock,
    PatchDataCell,
    SpriteBlockType,
    SpriteType,
    LandFields,
} from '../utils/common_types.js'
import {
    ChunkHeightBuffer,
    ChunkDataContainer,
    ChunkMask,
    ChunkMetadata,
    ChunkSharedContainer,
    ChunkStub,
} from '../datacontainers/ChunkContainer.js'
import { GroundPatch } from '../processing/GroundPatch.js'
import { clamp } from '../utils/math_utils.js'

import { adjustItemBounds } from '../utils/misc_utils.js'
import { WorldGlobals } from '../config/WorldEnv.js'
import {
    BlockDataAdapter,
    BlockDataType,
    ChunkBlockData,
    ChunkDataAdapter,
    SolidBlockData,
    SpriteBlockData,
} from '../datacontainers/BlockDataAdapter.js'

import { WorldModules } from './WorldModules.js'
import { Ground } from '../procgen/Ground.js'

export class ChunkBlocksContainer extends ChunkDataContainer<ChunkBlockData> {
    static dataAdapter = new ChunkDataAdapter()
    override dataAdapter: BlockDataAdapter<ChunkBlockData> = ChunkBlocksContainer.dataAdapter
}

const highlightPatchBorders = (localPos: Vector2) => {
    const { borderHighlightColor } = WorldGlobals.instance.debug.patch
    return borderHighlightColor && (localPos.x === 1 || localPos.y === 1) ? borderHighlightColor : null
}

export const getSolidBlock = (blockType: BlockType, isCheckerBlock = false) => {
    const empty = false
    const data: SolidBlockData = {
        blockType,
        isCheckerBlock,
    }
    const dataType = BlockDataType.SolidBlock
    const block: ChunkBlockData = {
        empty,
        data,
        dataType,
    }
    return block
}

const getSpriteBlock = (spriteType: SpriteBlockType) => {
    const count = spriteType === SpriteType.GRASS5 ? 1 : 2
    const empty = false
    const data: SpriteBlockData = {
        spriteType,
        count,
    }
    const dataType = BlockDataType.SpriteBlock
    const block: ChunkBlockData = {
        empty,
        data,
        dataType,
    }
    return block
}

export class GroundChunk extends ChunkBlocksContainer {
    generateHeightBuffer(block: PatchGroundBlock, ymin: number, ymax: number, ground: Ground, spriteType?: number) {
        //, isTransition = false) {
        const undegroundDepth = 4
        const { biome: biomeType, landIndex } = block.data
        const blockLocalPos = block.localPos
        const biomeLand = ground.biomes[biomeType].nth(landIndex)
        const landConf = biomeLand.data as LandFields
        const blockType = highlightPatchBorders(blockLocalPos) || landConf.type // isTransition ? BlockType.SAND :
        // const groundFlags = parseGroundFlags(flags)
        // const blockMode = groundFlags.boardMode
        //   ? BlockMode.CHECKERBOARD
        //   : BlockMode.REGULAR
        const bedRock = getSolidBlock(biomeType === BiomeType.Arctic ? BlockType.ICE : BlockType.BEDROCK)
        const groundSurface = getSolidBlock(blockType) // this.dataEncoder(blockType, blockMode)
        const undergroundLayer = getSolidBlock(landConf.subtype || BlockType.BEDROCK) // this.dataEncoder(landConf.subtype || BlockType.BEDROCK)
        // const hasSprite = landConf.key === 'LANDS' //landConf.flora.find(item => item.type === 'sprite')
        // const spriteLayer = hasSprite && spriteDensity.getBlockDensity(block.pos, 0.5) ? getSpriteBlock(0, 1) : null
        const spriteLayer = spriteType !== undefined ? getSpriteBlock(spriteType) : null
        const topLevel = block.data.level + (spriteLayer ? 1 : 0)
        // generate ground buffer
        const buffSize = clamp(topLevel - ymin, 0, ymax - ymin)
        if (buffSize > 0) {
            const groundBuffer = new Array(topLevel - ymin)
            // fill with bedrock first
            groundBuffer.fill(bedRock)
            // add underground layer
            groundBuffer.fill(undergroundLayer, -undegroundDepth - 1)
            // ground surface block
            groundBuffer.fill(groundSurface, spriteLayer ? -2 : -1)
            // finish with sprite blocks over surface
            spriteLayer && groundBuffer.fill(spriteLayer, -1)
            const chunkBuffer: ChunkHeightBuffer<ChunkBlockData> = {
                pos: blockLocalPos,
                content: groundBuffer.slice(0, buffSize),
            }
            return chunkBuffer
        }
        return undefined
    }

    bake(worldModules: WorldModules, groundLayer?: GroundPatch, cavesMask?: ChunkMask) {
        const { worldLocalEnv, ground, spawn } = worldModules
        const patchDim = worldLocalEnv.getPatchDimensions()
        const patchId = asVect2(this.chunkId as Vector3)
        const patchKey = serializePatchId(patchId)
        groundLayer = groundLayer || new GroundPatch().fromKey(patchKey, patchDim, 1)
        groundLayer.isEmpty && groundLayer.bake(worldModules)
        // const spriteSpots = worldModules.spawnDistributionMap.invertedQueryMapArea(groundLayer.bounds)
        const ymin = this.extendedBounds.min.y
        const ymax = this.extendedBounds.max.y
        // const isBiomeTransition = groundLayer.isTransitionPatch()
        const blocks = groundLayer.iterData()
        for (const block of blocks) {
            // const threshold = 0.2
            // const transition = 0.2

            // const drawSprite = (distNoise: number) => {
            //     const probability = 1 - (distNoise - 0.2) / transition

            //     const rand = Math.random()
            //     return rand <= probability
            // }
            // const getSpriteType = () => {
            //     const spriteNoise = worldModules.spriteDistribution.eval(block.pos)
            //     return spriteNoise > 0.65 ? SpriteType.FLOWER2 : spriteNoise < 0.3 ? SpriteType.FLOWER : SpriteType.GRASS6
            // }
            // const distNoise = worldModules.spawnDistributionMap.spawnDistributionLaw.eval(block.pos)
            // const isTransitionZone = (distNoise: number) => distNoise > 0.2 && distNoise <= (threshold + transition)
            // const isSpriteZone = (distNoise: number) => distNoise > 0.1 && distNoise <= threshold
            // const hasSprite = isSpriteZone(distNoise) || isTransitionZone(distNoise) && drawSprite(distNoise)
            // const spriteType = hasSprite ? getSpriteType() : undefined
            const spriteType = spawn.getSpriteType(block.pos)||undefined
            const groundBlocks = block.data ? this.generateHeightBuffer(block as PatchGroundBlock, ymin, ymax, ground, spriteType) : null
            if (groundBlocks) {
                // const chunk_buffer = this.readBuffer(groundBuff.pos)
                // chunk_buffer.set(groundBuff.content)
                this.writeBlocksBuffer(groundBlocks.pos, groundBlocks.content)
            }
        }

        cavesMask?.applyMaskOnTargetChunk(this)
    }
}

/**
 * Underground chunk (caverns)
 */

export class CavesMask extends ChunkMask {
    bake(worldModules: WorldModules) {
        const groundLayer = new GroundPatch(asBox2(this.bounds))
        groundLayer.bake(worldModules)
        // const bounds = asBox3(groundLayer.bounds)
        // bounds.max.y = groundLayer.valueRange.max
        // const chunkContainer = new ChunkContainer(bounds, 1)
        // chunkContainer.rawData.fill(0)
        for (const block of groundLayer.iterData()) {
            // const buffPos = asVect2(block.localPos)
            // const chunkBuff = chunkContainer.readBuffer(buffPos)
            const groundLevel = block.data?.level || 0
            const ymin = this.extendedBounds.min.y
            const ymax = Math.min(groundLevel, this.extendedBounds.max.y)
            let startIndex = this.getIndex(block.localPos)
            for (let y = ymin; y <= ymax; y++) {
                const isEmptyBlock = worldModules.cavesDensity.getBlockDensity(asVect3(block.pos, y), groundLevel + 20)
                this.rawData[startIndex++] = isEmptyBlock ? 0 : 1
            }
            // chunkContainer.writeBuffer(buffPos, chunkBuff)
        }
    }
}

/**
 * Spawn chunks
 */

export type SpawnMetadata = {
    spawnType: SpawnType
    spawnCat: SpawnCategory
    spawnRadius: number
    spawnOrigin?: Vector3
}
export type SpawnChunkMetadata = ChunkMetadata & SpawnMetadata
export type SpawnChunkStub = ChunkStub<SpawnChunkMetadata>
export type SpawnData = {
    spawnOrigin: Vector3
    spawnType: SpawnType
}

export class SpawnChunk extends ChunkSharedContainer<ChunkBlockData> {
    static dataAdapter = new ChunkDataAdapter()
    override dataAdapter: BlockDataAdapter<ChunkBlockData> = SpawnChunk.dataAdapter

    protected override rawData: Uint16Array<ArrayBufferLike>
    spawnOrigin: Vector3 | undefined
    spawnType: SpawnType
    spawnCat: SpawnCategory

    constructor({ metadata, rawdata: externalData }: SpawnChunkStub, spawnOrigin?: Vector3) {
        super(adjustItemBounds(metadata.bounds, spawnOrigin), metadata.margin)
        this.rawData = externalData
        this.spawnOrigin = spawnOrigin
        this.spawnType = metadata.spawnType
        this.spawnCat = metadata.spawnCat
    }

    retrieveBottomBlocks(blocksProvider: (input: Vector2[]) => PatchDataCell<BlockData>[]) {
        const chunkBottomBlocks: Vector2[] = []
        // iter slice blocks
        for (const heightBuff of this.iterHeightBuffers()) {
            if (heightBuff.content[0]) chunkBottomBlocks.push(heightBuff.pos)
        }
        const blocksBatch = blocksProvider(chunkBottomBlocks)
        // console.log(testBlock)
        return blocksBatch
    }

    /**
     *  adjust chunk elevation or discard schematics if above terrain hole
     * @param itemChunk
     * @returns
     */
    fitGround(blocksProvider: (input: Vector2[]) => PatchDataCell<BlockData>[]) {
        let isDiscarded = true
        const blocksResult = this.retrieveBottomBlocks(blocksProvider)
        const itemBottomBlocks = Object.values(blocksResult)
        const hasHoleBlock = itemBottomBlocks.find(block => block.data.type === BlockType.HOLE)
        // any schematics having at least one hole block below is considered discarded
        if (!hasHoleBlock) {
            // adjust item's final height
            const [lowestBlock] = itemBottomBlocks.sort((b1, b2) => b1.data.level - b2.data.level)
            const lowestHeight = lowestBlock?.data.level || 0
            const heightOffset = this.bounds.min.y - lowestHeight
            // adjust chunk elevation according to lowest block
            this.bounds.translate(new Vector3(0, -heightOffset, 0))
            isDiscarded = false
        }
        // if (isDiscarded) console.log('discarded item: ', this)
        return !isDiscarded
    }

    getUpperBlock(worldPos: Vector2) {
        const patchLocalPos = this.toPatchLocalPos(worldPos)
        const dataArray = this.readRawBuffer(patchLocalPos)
        dataArray.reverse()
        const index = dataArray.findIndex(val => !!val)

        if (index !== -1) {
            const level = this.bounds.max.y - index
            const rawVal = dataArray[index]
            const chunkBlock = this.dataAdapter.decode(rawVal || 0)
            const type = (chunkBlock.data as SolidBlockData).blockType
            // if (rawData && peakBlockLevel > peakBlock.level) {
            //   peakBlock.level = peakBlockLevel
            //   peakBlock.type = rawData || BlockType.NONE
            // }
            return { level, type }
        }
        return null
    }

    override toStub(): SpawnChunkStub {
        const baseStub = super.toStub()
        const { spawnCat, spawnType, spawnOrigin } = this
        const { metadata, rawdata } = baseStub
        const spawnMetadata: SpawnMetadata = {
            spawnType,
            spawnCat,
            // spawnOrigin,
            spawnRadius: 0,
        }
        const spawnChunkMetadata: SpawnChunkMetadata = { ...metadata, ...spawnMetadata }
        if (spawnOrigin) spawnMetadata.spawnOrigin = spawnOrigin
        const spawnStub: SpawnChunkStub = { metadata: spawnChunkMetadata, rawdata }
        return spawnStub
    }

    toLightStub() {
        const { spawnType } = this
        const spawnOrigin = this.spawnOrigin as Vector3
        const spawnData: SpawnData = {
            spawnOrigin,
            spawnType,
        }
        return spawnData
    }
}
