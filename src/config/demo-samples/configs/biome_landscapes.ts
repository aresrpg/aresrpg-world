import { BiomeType, BlockType } from '../../../index.js'

import { SCHEMATICS_COLLECTIONS } from './schematics_collections.js'

const { alpine, temperate_forest, siberian } = SCHEMATICS_COLLECTIONS

/**
 * Temperate landscapes
 */

const temperate = {
  SEA: {
    x: 0,
    y: 0,
    type: BlockType.WATER,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 2,
  },
  SEA_END: { x: 0.18, y: 0.05 },
  BEACH: {
    x: 0.26,
    y: 0.21,
    type: BlockType.SAND,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 5,
  },
  CLIFF: {
    x: 0.33,
    y: 0.23,
    type: BlockType.ROCK,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 0,
  },
  CLIFF_END: { x: 0.48, y: 0.42 },
  LANDS: {
    x: 0.48,
    y: 0.42,
    type: BlockType.GRASS,
    subtype: BlockType.MUD,
    fadeIn: 0,
    fadeOut: 0.2,
    flora: {
      ...temperate_forest.medium,
      'trees/palmtree_big_1': 1,
      'trees/palmtree_big_2': 1,
      // 'trees/palmtree_big_3': 1,
      // 'rocks/boulder_small_1': 1,
      // 'rocks/boulder_small_2': 1,
      // 'rocks/boulder_small_3': 1,
    },
  },
  MOUNTAINS_LOW: {
    x: 0.68,
    y: 0.48,
    type: BlockType.ROCK,
    subtype: BlockType.ROCK,
    mixratio: 0.1,
    fadeIn: 0,
    fadeOut: 25,
    flora: { ...alpine.medium, ...alpine.small },
  },
  MOUNTAINS: {
    x: 0.8,
    y: 0.62,
    type: BlockType.ROCK,
    subtype: BlockType.ROCK,
    mixratio: 0.1,
    fadeIn: 0,
    fadeOut: 25,
    flora: { ...alpine.small },
  },
  MOUNTAINS_PEAK: {
    id: 6,
    x: 0.9,
    y: 0.76,
    type: BlockType.SNOW,
    subtype: BlockType.ROCK,
    fadeIn: 0,
    fadeOut: 0,
  },
  MOUNTAINS_PEAK_2: { x: 0.95, y: 0.92 },
  MOUNTAINS_PEAK_3: { x: 1, y: 0.9 },
}

/**
 * Arctic landscapes
 */
const arctic = {
  SEA: {
    id: 0,
    x: 0,
    y: 0,
    type: BlockType.WATER,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 1,
  },
  SEA_END: { x: 0.18, y: 0.05 },
  BEACH: {
    id: 2,
    x: 0.26,
    y: 0.21,
    type: BlockType.ICE,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 3,
  },
  CLIFF: {
    id: 3,
    x: 0.33,
    y: 0.23,
    type: BlockType.SNOW,
    subtype: BlockType.ICE,
    mixratio: 0.25,
    fadeIn: 2,
    fadeOut: 10,
  },
  CLIFF_END: { x: 0.48, y: 0.42 },
  LANDS: {
    id: 4,
    x: 0.48,
    y: 0.42,
    type: BlockType.SNOW,
    subtype: BlockType.ICE,
    fadeIn: 1,
    fadeOut: 5,
    flora: { ...temperate_forest.medium },
  },
  MOUNTAINS: {
    id: 5,
    x: 0.71,
    y: 0.45,
    type: BlockType.SNOW,
    subtype: BlockType.ROCK,
    fadeIn: 5,
    fadeOut: 30,
    flora: { ...siberian.medium },
  },
  MOUNTAINS_MIDDLE: {
    id: 6,
    x: 0.85,
    y: 0.65,
    type: BlockType.SNOW,
    subtype: BlockType.ROCK,
    fadeIn: 10,
    fadeOut: 40,
    flora: { ...alpine.small },
  },
  MOUNTAINS_PEAK: { x: 0.95, y: 0.7 },
  END: { x: 1, y: 0.7 },
}

/**
 * Desert landscapes
 */

const desert = {
  SEA: {
    id: 0,
    x: 0,
    y: 0,
    type: BlockType.WATER,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 1,
  },
  SEA_END: { x: 0.18, y: 0.05 },
  BEACH: {
    id: 2,
    x: 0.26,
    y: 0.21,
    type: BlockType.SAND,
    subtype: BlockType.NONE,
    fadeIn: 0,
    fadeOut: 3,
  },
  CLIFF: {
    id: 3,
    x: 0.33,
    y: 0.23,
    type: BlockType.ROCK,
    subtype: BlockType.SAND,
    fadeIn: 2,
    fadeOut: 10,
  },
  DUNES: {
    id: 4,
    x: 0.48,
    y: 0.42,
    type: BlockType.SAND,
    subtype: BlockType.NONE,
    fadeIn: 1,
    fadeOut: 10,
  },
  DUNES_END: {
    id: 5,
    x: 1,
    y: 0.52,
    type: BlockType.SAND,
    subtype: BlockType.ROCK,
    fadeIn: 5,
    fadeOut: 25,
  },
}

export const BIOMES_LANDSCAPES_CONFIG: Record<BiomeType, any> = {
  [BiomeType.Temperate]: temperate,
  [BiomeType.Arctic]: arctic,
  [BiomeType.Desert]: desert,
  [BiomeType.Tropical]: temperate,
  [BiomeType.Scorched]: temperate,
  [BiomeType.Swamp]: temperate,
  [BiomeType.Glacier]: arctic,
  [BiomeType.Taiga]: temperate,
  [BiomeType.Grassland]: temperate,
}
