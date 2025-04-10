// import { MathUtils, Vector3 } from 'three'
import { Vector3 } from 'three'

import { asVect2, serializePatchId, asBox2, asVect3 } from '../utils/patch_chunk.js'
import { Block, BlockData, BlockType, SpawnType, PatchBlock, SpawnCategory } from '../utils/common_types.js'
import {
    ChunkHeightBuffer,
    ChunkDataContainer,
    ChunkMask,
    ChunkDataStub,
    ChunkMetadata,
    ChunkSharedContainer,
} from '../datacontainers/ChunkContainer.js'
import { GroundPatch } from '../processing/GroundPatch.js'
import { clamp } from '../utils/math_utils.js'
import { Biome, BiomeType } from '../procgen/Biome.js'
import { WorldModules } from './WorldModules.js'
import { adjustItemBounds } from '../utils/misc_utils.js'
import { WorldGlobals } from '../config/WorldEnv.js'

const highlightPatchBorders = (localPos: Vector3) => {
    const { borderHighlightColor } = WorldGlobals.instance.debug.patch
    return borderHighlightColor && (localPos.x === 1 || localPos.z === 1) ? borderHighlightColor : null
}

export class GroundChunk extends ChunkDataContainer {
    generateHeightBuffer(block: PatchBlock, ymin: number, ymax: number, biome: Biome) {
        //, isTransition = false) {
        const undegroundDepth = 4
        const { biome: biomeType, landIndex } = block.data
        const blockLocalPos = block.localPos as Vector3
        const biomeLand = biome.mappings[biomeType].nth(landIndex)
        const landConf = biomeLand.data
        const blockType = highlightPatchBorders(blockLocalPos) || landConf.type // isTransition ? BlockType.SAND :
        // const groundFlags = parseGroundFlags(flags)
        // const blockMode = groundFlags.boardMode
        //   ? BlockMode.CHECKERBOARD
        //   : BlockMode.REGULAR
        const groundSurface = blockType // this.dataEncoder(blockType, blockMode)
        const undergroundLayer = landConf.subtype || BlockType.BEDROCK // this.dataEncoder(landConf.subtype || BlockType.BEDROCK)
        const topLevel = block.data.level + 1
        // generate ground buffer
        const buffSize = clamp(topLevel - ymin, 0, ymax - ymin)
        if (buffSize > 0) {
            const groundBuffer = new Uint16Array(topLevel - ymin)
            // fill with bedrock first
            groundBuffer.fill(biomeType === BiomeType.Arctic ? BlockType.ICE : BlockType.BEDROCK)
            // add underground layer
            groundBuffer.fill(undergroundLayer, groundBuffer.length - (undegroundDepth + 1))
            // ground surface block
            groundBuffer[groundBuffer.length - 1] = groundSurface
            // groundBuffer[groundBuffer.length - 2] = groundSurface
            // // finish with sprite block
            // groundBuffer[groundBuffer.length - 1] = (block.pos.x % 4 === 0 && block.pos.z % 4 === 0) ? BlockType.ICE : BlockType.NONE
            const chunkBuffer: ChunkHeightBuffer = {
                pos: asVect2(blockLocalPos),
                content: groundBuffer.slice(0, buffSize),
            }
            return chunkBuffer
        }
        return undefined
    }

    bake(worldModules: WorldModules, groundLayer?: GroundPatch, cavesMask?: ChunkMask) {
        const { worldLocalEnv } = worldModules
        const patchDim = worldLocalEnv.getPatchDimensions()
        const patchId = asVect2(this.chunkId as Vector3)
        const patchKey = serializePatchId(patchId)
        groundLayer = groundLayer || new GroundPatch().fromKey(patchKey, patchDim, 1)
        groundLayer.isEmpty && groundLayer.bake(worldModules)

        const ymin = this.extendedBounds.min.y
        const ymax = this.extendedBounds.max.y

        // const isBiomeTransition = groundLayer.isTransitionPatch()

        const blocks = groundLayer.iterBlocksQuery()
        for (const block of blocks) {
            const groundBuff = this.generateHeightBuffer(block, ymin, ymax, worldModules.biomes)
            if (groundBuff) {
                const chunk_buffer = this.readBuffer(groundBuff.pos)
                chunk_buffer.set(groundBuff.content)
                this.writeBuffer(groundBuff.pos, chunk_buffer)
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
        const patchIter = groundLayer.iterBlocksQuery()
        for (const block of patchIter) {
            // const buffPos = asVect2(block.localPos)
            // const chunkBuff = chunkContainer.readBuffer(buffPos)
            const groundLevel = block.pos.y
            const ymin = this.extendedBounds.min.y
            const ymax = Math.min(groundLevel, this.extendedBounds.max.y)
            const startLocalPos = new Vector3(block.localPos.x, -1, block.localPos.z)
            let startIndex = this.getIndex(startLocalPos)
            for (let y = ymin; y <= ymax; y++) {
                block.pos.y = y
                const isEmptyBlock = worldModules.densityVolume.getBlockDensity(block.pos, groundLevel + 20)
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
export type SpawnChunkStub = ChunkDataStub<SpawnChunkMetadata>
export type SpawnData = {
    spawnOrigin: Vector3
    spawnType: SpawnType
}

export class SpawnChunk extends ChunkSharedContainer {

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

    retrieveBottomBlocks(blocksProvider: (input: Vector3[]) => Block<BlockData>[]) {
        const chunkBottomBlocks: Vector3[] = []
        // iter slice blocks
        for (const heightBuff of this.iterHeightBuffers()) {
            if (heightBuff.content[0]) chunkBottomBlocks.push(asVect3(heightBuff.pos, 0))
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
    fitGround(blocksProvider: (input: Vector3[]) => Block<BlockData>[]) {
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
        if (isDiscarded) console.log('discarded item: ', this)
        return !isDiscarded
    }

    getUpperBlock(worldPos: Vector3) {
        const localPos = this.toLocalPos(worldPos)
        const dataArray = this.readBuffer(asVect2(localPos))
        dataArray.reverse()
        const index = dataArray.findIndex(val => !!val)

        if (index !== -1) {
            const level = this.bounds.max.y - index
            const type = dataArray[index]
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
            spawnRadius: 0
        }
        const spawnChunkMetadata: SpawnChunkMetadata = { ...metadata, ...spawnMetadata }
        if (spawnOrigin) spawnMetadata.spawnOrigin = spawnOrigin
        const spawnStub: SpawnChunkStub = { metadata: spawnChunkMetadata, rawdata }
        return spawnStub
    }

    toLightStub() {
        const { spawnOrigin, spawnType } = this
        const spawnData: SpawnData = {
            spawnOrigin,
            spawnType
        }
        return spawnData
    }
}
