import { BiomeType, BlockMode, BlockType, GroundBlockData, SpriteBlockType } from '../utils/common_types.js'
import { BiomeNumericType, reverseBiomeNumericType } from '../utils/misc_utils.js'

/**
 * ```
 * +----------+
 * | DECODING |
 * +----------+
 * ```
 * ```
 *   1010|110|1100 (encoded data)
 *        ^^^        (read bits)
 * ```
 *
 * - shift bits to the right to remove 4 right-most bits
 *  ```
 *      1010|110|1100 >> 4 = 1010|110
 *  ```
 *
 * - build a mask to keep only 3 read bits
 *  ```
 *      1<<4    => 1000
 *      1<<4 - 1=> 0111
 *  ```
 *
 * - apply mask to hide 4 left-most bits
 *  ```
 *      1010 110    (data)
 *    & 0000 111    (mask)
 *      ---------
 *      0000 110    (left bits)
 * ```
 */

export interface BlockDataAdapter<BlockData> {
    decode(rawData: number): BlockData
    encode(blockData: BlockData): number
}

export class IdenticalDataAdapter implements BlockDataAdapter<number> {
    decode(rawData: number): number {
        return rawData
    }

    encode(blockData: number): number {
        return blockData
    }
}

export class IdenticalBoolAdapter implements BlockDataAdapter<boolean> {
    decode(rawData: number): boolean {
        return Boolean(rawData)
    }

    encode(blockData: boolean): number {
        return Number(blockData)
    }
}

// bits allocated per data type, total 9+4+7+3 = 23 bits
const PatchBitAllocation = {
    level: 9, // level values ranging from 0 to 512
    biome: 4, // 16 biomes
    landIndex: 7, // 128 landscapes per biome
    flags: 3, // 8 additional flags
}

export class GroundDataAdapter implements BlockDataAdapter<GroundBlockData> {
    // implements BlockDataAdapter<GroundBlockData> {

    decode(rawData: number) {
        const shift = PatchBitAllocation
        // build a mask: 1<<4 = 1000
        const level = (rawData >> (shift.biome + shift.landIndex + shift.flags)) & ((1 << shift.level) - 1)
        const biomeNum = (rawData >> (shift.landIndex + shift.flags)) & ((1 << shift.biome) - 1)
        const biome = reverseBiomeNumericType[biomeNum] || BiomeType.Temperate
        const landIndex = (rawData >> shift.flags) & ((1 << shift.landIndex) - 1)
        const flags = rawData & ((1 << shift.flags) - 1)
        const blockData: GroundBlockData = {
            level,
            biome,
            landIndex,
            flags,
        }
        return blockData
    }

    encode(groundData: GroundBlockData): number {
        const { level, biome, landIndex, flags } = groundData
        const shift = PatchBitAllocation
        let blockRawVal = level
        blockRawVal = (blockRawVal << shift.biome) | BiomeNumericType[biome]
        blockRawVal = (blockRawVal << shift.landIndex) | landIndex
        blockRawVal = (blockRawVal << shift.flags) | (flags || BlockMode.REGULAR)
        return blockRawVal
    }
}

export enum BlockDataType {
    SolidBlock,
    SpriteBlock,
}

const ChunkDataBitAllocation = {
    empty: 1, // emptiness
    data: 13,
    dataType: 1, // SOLID, SPRITE
}

const SolidDataBitAlloc = {
    checkerMode: 1,
    blockType: 12, // 4096 solid block types
}

const SpriteDataBitAlloc = {
    spriteType: 10, // 1024 sprite block types
    count: 2, // 1-4 sprite fragments
}

export type SolidBlockData = {
    isCheckerBlock?: boolean
    blockType: BlockType
}

export type SpriteBlockData = {
    spriteType: SpriteBlockType
    count: number
}

export type ChunkBlockData = {
    empty: boolean
    data?: SolidBlockData | SpriteBlockData
    dataType?: BlockDataType
}

export class SolidDataAdapter implements BlockDataAdapter<SolidBlockData> {
    decode(rawData: number) {
        const shift = SolidDataBitAlloc
        const isCheckerBlock = !!(rawData & ((1 << shift.checkerMode) - 1))
        const blockType = (rawData >> shift.checkerMode) & ((1 << shift.blockType) - 1)
        const data: SolidBlockData = {
            isCheckerBlock,
            blockType,
        }
        return data
    }

    encode({ blockType, isCheckerBlock }: SolidBlockData): number {
        const shift = SolidDataBitAlloc
        const checkerMode = isCheckerBlock ? 1 : 0
        let rawVal = blockType
        rawVal = (rawVal << shift.checkerMode) | checkerMode
        return rawVal
    }
}

export class SpriteDataAdapter implements BlockDataAdapter<SpriteBlockData> {
    decode(rawData: number) {
        const shift = SpriteDataBitAlloc
        const spriteType = rawData & ((1 << shift.spriteType) - 1)
        const count = (rawData >> shift.spriteType) & ((1 << shift.count) - 1)
        const blockData: SpriteBlockData = {
            spriteType,
            count,
        }
        return blockData
    }

    encode({ spriteType, count }: SpriteBlockData): number {
        const shift = SpriteDataBitAlloc
        let rawVal = count
        rawVal = (rawVal << shift.spriteType) | spriteType
        return rawVal
    }
}

export class ChunkDataAdapter implements BlockDataAdapter<ChunkBlockData> {
    spriteDataAdapter = new SpriteDataAdapter()
    solidDataAdapter = new SolidDataAdapter()

    decodeData(rawData: number, dataType: BlockDataType) {
        switch (dataType) {
            case BlockDataType.SolidBlock:
                return this.solidDataAdapter.decode(rawData)
            case BlockDataType.SpriteBlock:
                return this.spriteDataAdapter.decode(rawData)
        }
    }

    decode(rawData: number): ChunkBlockData {
        const shift = ChunkDataBitAllocation
        const emptyFlag = rawData & ((1 << shift.empty) - 1)

        const empty = !emptyFlag
        if (!empty) {
            const dataType = (rawData >> (shift.data + shift.empty)) & ((1 << shift.dataType) - 1)
            const rawBlockData = (rawData >> shift.empty) & ((1 << shift.data) - 1)
            const data = this.decodeData(rawBlockData, dataType)
            const chunkBlockData: ChunkBlockData = {
                empty,
                data,
                dataType,
            }
            return chunkBlockData
        }
        return { empty }
    }

    encodeBlock(blockData: number, dataType: BlockDataType) {
        const bitShift = ChunkDataBitAllocation
        let rawVal: number = dataType
        rawVal = (rawVal << bitShift.data) | blockData
        rawVal = (rawVal << bitShift.empty) | 1
        return rawVal
    }

    encodeSolidBlock(blockType: BlockType, isCheckerBlock = false) {
        const isEmpty = blockType === BlockType.NONE
        if (!isEmpty) {
            const solidData = this.solidDataAdapter.encode({ blockType, isCheckerBlock })
            return this.encodeBlock(solidData, BlockDataType.SolidBlock)
        } else return 0
    }

    encodeSpriteBlock(spriteType: SpriteBlockType, count = 1) {
        const spriteData = this.spriteDataAdapter.encode({ spriteType, count })
        return this.encodeBlock(spriteData, BlockDataType.SpriteBlock)
    }

    encode({ data, dataType }: ChunkBlockData) {
        switch (dataType) {
            case BlockDataType.SolidBlock: {
                const solidBlockData = data as SolidBlockData
                return this.encodeSolidBlock(solidBlockData.blockType, solidBlockData.isCheckerBlock)
            }
            case BlockDataType.SpriteBlock: {
                const spriteBlockData = data as SpriteBlockData
                return this.encodeSpriteBlock(spriteBlockData.spriteType, spriteBlockData.count)
            }
            default:
                return 0
        }
    }
}
