import { Vector2, Vector3 } from 'three'

import { ProcItemConf } from '../tools/ProceduralGenerators.js'
import { SchematicsBlocksMapping } from '../tools/SchematicLoader.js'
import { BiomesRawConf, BlockType, SpawnProfiles, SpawnType } from '../utils/common_types.js'
import { SpawnRules } from '../procgen/ItemsMapDistribution.js'

export enum WorldSeed {
    Global = 'global',
    Heightmap = 'heightmap',
    Amplitude = 'amplitude',
    Heatmap = 'heatmap',
    Rainmap = 'rainmap',
    RandomPos = 'random_pos',
    Spawn = 'spawn',
    Density = 'density',
    Sprite = 'sprite',
}

const WORLD_FALLBACK_SEED = 'world_seed'
// const WORLD_DEFAULT_SEED = 'world_seed'

export type WorldSeeds = Partial<Record<WorldSeed, string>>

export type ChunksVerticalRange = {
    bottomId: number
    topId: number
}

export type PatchViewRanges = {
    near: number // undeground view dist
    far: number // ground surface view dist
}

export type BiomesEnvSettings = {
    rawConf: BiomesRawConf
    seaLevel: number
    periodicity: number
    repartition: {
        centralHalfSegment: number
        transitionHalfRange: number
    }
}

export type HeightmapEnvSettings = {
    spreading: number
    harmonics: number
    seed?: string
}

export type DebugEnvSettings = {
    logs: boolean
    patch: {
        borderHighlightColor: BlockType
    }
    board: {
        startPosHighlightColor: BlockType
        splitSidesColoring: boolean
    }
    schematics: {
        missingBlockType: BlockType
    }
}

export type ItemsEnv = {
    schematics: {
        globalBlocksMapping: SchematicsBlocksMapping
        localBlocksMapping: Record<SpawnType, SchematicsBlocksMapping>
        filesIndex: Record<SpawnType, string>
    }
    proceduralConfigs: Record<SpawnType, ProcItemConf>
}

type WorldGlobalsStub = {
    debug?: DebugEnvSettings
}

const getDefaultSpawnProfiles = () => {

    enum SpawnProfile {
        Default = 'default',
        Low = 'low',
        High = 'high',
        Strict = 'strict',
    }

    const defaultSpawnProfiles: Record<SpawnProfile, SpawnRules> = {
        [SpawnProfile.Default]: {
            overlapTolerance: 0.5,
            overlapProbability: 0.5
        },
        [SpawnProfile.Low]: {
            overlapTolerance: 0.2,
            overlapProbability: 0.2
        },
        [SpawnProfile.High]: {
            overlapTolerance: 0.4,
            overlapProbability: 0.8
        },
        [SpawnProfile.Strict]: {
            overlapTolerance: 0,
            overlapProbability: 0
        }
    }

    return defaultSpawnProfiles
}

export class WorldGlobals {
    // eslint-disable-next-line no-use-before-define
    static singleton: WorldGlobals
    static get instance() {
        this.singleton = this.singleton || new WorldGlobals()
        return this.singleton
    }

    debug = {
        logs: false,
        patch: {
            borderHighlightColor: BlockType.NONE,
        },
        board: {
            startPosHighlightColor: BlockType.NONE,
            splitSidesColoring: false,
        },
        schematics: {
            missingBlockType: BlockType.NONE,
        },
    }

    import(worldGlobalsStub: WorldGlobalsStub) {
        const { debug } = worldGlobalsStub
        this.debug = debug || this.debug
    }

    export() {
        const { debug } = this
        return { debug } as WorldGlobalsStub
    }
}

export const getWorldSeed = (worldSeeds: WorldSeeds, seedName: WorldSeed) => {
    const seed = worldSeeds[seedName] || worldSeeds[WorldSeed.Global] || WORLD_FALLBACK_SEED
    // console.log(`${seedName}: ${seed}`)
    return seed
}

export type WorldLocalSettings = {
    seeds: WorldSeeds

    distribution: {
        mapPatchRange: number
        profiles: SpawnProfiles
    }

    chunks: {
        powSize: number // as a power of two
        verticalRange: ChunksVerticalRange
    }

    items: ItemsEnv

    heightmap: HeightmapEnvSettings

    biomes: BiomesEnvSettings

    boards: {
        radius: number
        thickness: number
    }

    // cache: {
    //   patchCountRadius: number, // max cache radius in patch units,
    // },

    globals: WorldGlobalsStub
}

export class WorldLocals {
    // export const getWorldEnv = () => {
    rawSettings: WorldLocalSettings = {
        seeds: {
            [WorldSeed.Global]: WORLD_FALLBACK_SEED,
        },

        distribution: {
            mapPatchRange: 4, // extent of distribution map repeated pattern in patch units
            profiles: getDefaultSpawnProfiles()
        },

        chunks: {
            powSize: 6,
            // idRange
            verticalRange: {
                bottomId: 0,
                topId: 5,
            },
        },

        items: {
            schematics: {
                globalBlocksMapping: {} as SchematicsBlocksMapping,
                localBlocksMapping: {} as Record<SpawnType, SchematicsBlocksMapping>,
                filesIndex: {} as Record<SpawnType, string>,
            },
            proceduralConfigs: {} as Record<SpawnType, ProcItemConf>,
        },

        heightmap: {
            spreading: 0.42,
            harmonics: 6,
        },

        biomes: {
            rawConf: {} as BiomesRawConf,
            seaLevel: 0,
            periodicity: 8,
            repartition: {
                centralHalfSegment: 0.07, // half range of central segment in proportion to first and last symetrical segments
                transitionHalfRange: 0.05, // bilinear interpolation: 0 = no transition, 0.05 = max transition
            },
        },

        boards: {
            radius: 16,
            thickness: 3,
        },

        globals: {},
        // cache: {
        //   patchCountRadius: 16, // 4 => 16 patches radius
        // },
    }

    // Shortcuts for modules' environment access
    get biomeEnv() {
        return this.rawSettings.biomes
    }

    get heightmapEnv() {
        return this.rawSettings.heightmap
    }

    get boardEnv() {
        return this.rawSettings.boards
    }

    get itemsEnv() {
        return this.rawSettings.items
    }

    get globalEnv() {
        return this.rawSettings.globals
    }

    // Helpers/utils
    getPatchSize = () => Math.pow(2, this.rawSettings.chunks.powSize)
    getPatchDimensions = () => new Vector2(this.getPatchSize(), this.getPatchSize())

    getChunkDimensions = () => new Vector3(this.getPatchSize(), this.getPatchSize(), this.getPatchSize())

    getChunksVerticalRange = () => this.rawSettings.chunks.verticalRange

    getSeaLevel = () => this.rawSettings.biomes.seaLevel
    setSeaLevel = (seaLevel: number) => (this.rawSettings.biomes.seaLevel = seaLevel)

    getDistributionMapDimensions = () => new Vector2(1, 1).multiplyScalar(this.rawSettings.distribution.mapPatchRange * this.getPatchSize())

    getSeed = (seedName: WorldSeed) => getWorldSeed(this.rawSettings.seeds, seedName)

    // Export/import
    fromStub = (envStub: Partial<WorldLocalSettings>) => {
        Object.assign(this.rawSettings, envStub)
        return this
        // overrideSeeds(this.rawSettings.seeds.overrides)
    }

    toStub() {
        return this.rawSettings
        //   const { seeds, patchPowSize, cachePowLimit, defaultDistMapPeriod, patchViewCount, debug,
        //     chunks, schematics, proceduralItems, workerPool, boardSettings, heightmap, biomes } = this
        //   const envStub = {
        //     seeds, patchPowSize, cachePowLimit, defaultDistMapPeriod, patchViewCount, debug,
        //     chunks, schematics, proceduralItems, workerPool, boardSettings, heightmap, biomes
        //   }
        //   return envStub
    }

    // return {
    //   rawSettings,
    //   getPatchSize,
    //   getCacheLimit,
    //   getPatchDimensions,
    //   getChunkDimensions,
    //   getNearViewDist,
    //   getFarViewDist,
    //   getSeaLevel,
    //   setSeaLevel,
    //   getDistributionMapPeriod,
    //   fromStub
    // }
}
