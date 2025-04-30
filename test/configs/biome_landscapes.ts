// import { ExtBlock } from './blocks_mappings.js'

import { BiomeType, BlockType, SpriteType } from '../../src/utils/common_types.js'
import { SpawnArea, SpawnConfHelper } from '../../src/config/world-conf-helpers.js'

import { SCHEMATICS_COLLECTIONS } from './schematics_collections.js'

const { alpine, temperate_forest, siberian } = SCHEMATICS_COLLECTIONS

// const firstStep = {
//   x: 0,
//   y: 0.1
// }

// const lastStep = {
//   x: 1,
//   y: 0.1
// }

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
        spawn: SpawnConfHelper(
            new SpawnArea('villages', 0).addSparseSchematic('structures/mce-desertpyramid', 1).addSparseSchematic('', 10),
            new SpawnArea('fields', 0.1)
                .addSpriteZone(SpriteType.FLOWER, 0)
                .addSpriteZone(SpriteType.GRASS4, 0.3)
                .addSpriteZone(SpriteType.FLOWER2, 0.7),
            new SpawnArea('forest', 0.45).addSchematicsCollection(temperate_forest.medium),
            // .addSpriteZone(SpriteType.MUSHROOM, 0)
            // .addSpriteZone(SpriteType.MUSHROOM2, 0.55),
        ),
    },
    MOUNTAINS_LOW: {
        x: 0.68,
        y: 0.48,
        type: BlockType.ROCK,
        subtype: BlockType.ROCK,
        mixratio: 0.1,
        fadeIn: 0,
        fadeOut: 25,
        spawn: SpawnConfHelper(new SpawnArea('forest', 0.45).addSchematicsCollection(alpine.medium).addSchematicsCollection(alpine.small)),
    },
    MOUNTAINS: {
        x: 0.8,
        y: 0.62,
        type: BlockType.ROCK,
        subtype: BlockType.ROCK,
        mixratio: 0.1,
        fadeIn: 0,
        fadeOut: 25,
        spawn: SpawnConfHelper(new SpawnArea('forest', 0.45).addSchematicsCollection(alpine.small)),
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
        spawn: SpawnConfHelper(
            new SpawnArea('forest', 0.45)
                .addSchematicsCollection(temperate_forest.medium)
                .addSparseSchematic('structures/mce-desertpyramid', 1),
        ),
    },
    MOUNTAINS: {
        id: 5,
        x: 0.71,
        y: 0.45,
        type: BlockType.SNOW,
        subtype: BlockType.ROCK,
        fadeIn: 5,
        fadeOut: 30,
        spawn: SpawnConfHelper(new SpawnArea('forest', 0.45).addSchematicsCollection(siberian.medium)),
    },
    MOUNTAINS_MIDDLE: {
        id: 6,
        x: 0.85,
        y: 0.65,
        type: BlockType.SNOW,
        subtype: BlockType.ROCK,
        fadeIn: 10,
        fadeOut: 40,
        spawn: SpawnConfHelper(new SpawnArea('forest', 0.45).addSchematicsCollection(alpine.small)),
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
        flora: { 'structures/mce-desertpyramid': 1 },
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

// const grassland = {
//   first: {
//     ...firstStep,
//     type: BlockType.FOLIAGE_DARK,
//   },
//   last: { ...lastStep },
// }

// const swamp = {
//   first: {
//     ...firstStep,
//     type: BlockType.MUD,
//   },
//   last: { ...lastStep },
// }

// const glacier = {
//   first: {
//     ...firstStep,
//     type: BlockType.ICE,
//   },
//   last: { ...lastStep },
// }

// const taiga = {
//   first: {
//     ...firstStep,
//     type: BlockType,
//   },
//   last: { ...lastStep },
// }

// const tropical = {
//   first: {
//     ...firstStep,
//     type: ExtBlock.DBG_ORANGE,
//   },
//   last: { ...lastStep },
// }

// const scorched = {
//   first: {
//     ...firstStep,
//     type: BlockType.HOLE,
//   },
// }

export const BIOMES_LANDSCAPES_CONFIG: Record<BiomeType, any> = {
    // TEMPERATE
    [BiomeType.Temperate]: temperate,
    [BiomeType.Grassland]: temperate,
    [BiomeType.Swamp]: temperate,
    // COLD
    [BiomeType.Arctic]: arctic,
    [BiomeType.Glacier]: arctic,
    [BiomeType.Taiga]: arctic,
    // HOT
    [BiomeType.Desert]: desert,
    [BiomeType.Tropical]: desert,
    [BiomeType.Scorched]: desert,
}
