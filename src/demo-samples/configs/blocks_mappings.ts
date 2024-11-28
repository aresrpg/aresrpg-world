import { BlockType, WorldUtils } from "../../index"

/**
 * Extending world reserved blocks
 */
export const ExtBlock = {
  TREE_TRUNK: 0,
  TREE_TRUNK_LIGHT: 0,
  TREE_TRUNK_3: 0,
  TREE_TRUNK_WHITE: 0,
  TREE_TRUNK_DARK: 0,
  DBG_LIGHT: 0,
  DBG_DARK: 0,
  DBG_ORANGE: 0,
  DBG_GREEN: 0,
  DBG_PURPLE: 0,
}

// assing an enum id to each additional type
WorldUtils.typesNumbering(ExtBlock, BlockType.LAST_PLACEHOLDER)

/**
 * Blocks color mapping
 */
const RESERVED_BLOCKS_COLOR_MAPPING = {
  [BlockType.NONE]: 0x000000,
  [BlockType.HOLE]: 0x000000,
  [BlockType.BEDROCK]: 0xababab,
  [BlockType.WATER]: 0x74ccf4,
  [BlockType.ICE]: 0x74ccf4,
  [BlockType.MUD]: 0x795548,
  [BlockType.TRUNK]: 0x795548,
  [BlockType.SAND]: 0xc2b280,
  [BlockType.GRASS]: 0x41980a,
  [BlockType.ROCK]: 0xababab,
  [BlockType.SNOW]: 0xe5e5e5,
  [BlockType.FOLIAGE_LIGHT]: 0x558b2f,
  [BlockType.FOLIAGE_DARK]: 0x33691e,
}

const EXTENDED_BLOCKS_COLOR_MAPPINGS = {
  [ExtBlock.TREE_TRUNK]: 0x795548,
  [ExtBlock.TREE_TRUNK_LIGHT]: 0xb28459,
  [ExtBlock.TREE_TRUNK_3]: 0x585349,
  [ExtBlock.TREE_TRUNK_WHITE]: 0xded3d5,
  [ExtBlock.TREE_TRUNK_DARK]: 0x3f311d,
  [ExtBlock.DBG_LIGHT]: 0xf5deb3,
  [ExtBlock.DBG_DARK]: 0x101010,
  [ExtBlock.DBG_ORANGE]: 0xff9800, // 0x#FFC107
  [ExtBlock.DBG_GREEN]: 0xcddc39,
  [ExtBlock.DBG_PURPLE]: 0x8a2be2, // 0x673ab7,//0x9c27b0,
}

export const BLOCKS_COLOR_MAPPING = {...RESERVED_BLOCKS_COLOR_MAPPING, ...EXTENDED_BLOCKS_COLOR_MAPPINGS}

export const SCHEMATICS_BLOCKS_MAPPING = {
  air: BlockType.NONE,
  // grass: block_type.GRASS,
  // LOG
  acacia_log: ExtBlock.TREE_TRUNK_3,
  birch_log: ExtBlock.TREE_TRUNK_WHITE,
  jungle_log: ExtBlock.TREE_TRUNK,
  oak_log: ExtBlock.TREE_TRUNK,
  dark_oak_log: ExtBlock.TREE_TRUNK_DARK,
  spruce_log: ExtBlock.TREE_TRUNK,
  stripped_spruce_log: ExtBlock.TREE_TRUNK,
  stripped_dark_oak_log: ExtBlock.TREE_TRUNK,
  stripped_oak_log: ExtBlock.TREE_TRUNK,
  // WOOD
  acacia_wood: ExtBlock.TREE_TRUNK_3,
  birch_wood: ExtBlock.TREE_TRUNK_WHITE,
  jungle_wood: ExtBlock.TREE_TRUNK,
  oak_wood: ExtBlock.TREE_TRUNK,
  dark_oak_wood: ExtBlock.TREE_TRUNK_DARK,
  spruce_wood: ExtBlock.TREE_TRUNK,
  stripped_spruce_wood: ExtBlock.TREE_TRUNK,
  stripped_dark_oak_wood: ExtBlock.TREE_TRUNK,
  stripped_oak_wood: ExtBlock.TREE_TRUNK_LIGHT,
  // LEAVES
  acacia_leaves: BlockType.FOLIAGE_LIGHT,
  birch_leaves: BlockType.FOLIAGE_LIGHT,
  cherry_leaves: BlockType.FOLIAGE_LIGHT,
  mangrove_leaves: BlockType.FOLIAGE_DARK,
  oak_leaves: BlockType.FOLIAGE_LIGHT,
  dark_oak_leaves: BlockType.GRASS,
  spruce_leaves: BlockType.FOLIAGE_DARK,
  // STONES
  andesite: BlockType.ROCK,
  cobblestone: BlockType.ROCK,
  stone: BlockType.ROCK,
  tuff: BlockType.ROCK,
}