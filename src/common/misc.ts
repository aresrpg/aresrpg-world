import { BlockType } from '../common/types'
export const blockTypesColorMapping: Record<BlockType, number> = {
    [BlockType.ROCK]: 0xABABAB,
    [BlockType.GRASS]: 0x00B920,
    [BlockType.SNOW]: 0xE5E5E5,
    [BlockType.WATER]: 0x0055E2,
    [BlockType.SAND]: 0xDCBE28
}