import { Vector2, Vector2Like, Vector3, Vector3Like } from 'three'
import { LinkedList } from '../datacontainers/LinkedList.js'
import { SpawnRules } from '../procgen/SpawnDistributionMap.js'

// reserved native block types
export enum BlockType {
    NONE,
    HOLE,
    BEDROCK,
    WATER,
    ICE,
    MUD,
    TRUNK,
    SAND,
    GRASS,
    ROCK,
    SNOW,
    FOLIAGE_LIGHT,
    FOLIAGE_DARK,
    LAST_PLACEHOLDER,
}

export enum BiomeType {
    Temperate = 'temperate',
    Arctic = 'arctic',
    Desert = 'desert',
    Tropical = 'tropical',
    Scorched = 'scorched',
    Swamp = 'swamp',
    Glacier = 'glacier',
    Taiga = 'taiga',
    Grassland = 'grassland',
}

export type SpriteBlockType = number

export type Block<T> = {
    pos: Vector3
    data: T
}

export enum BlockMode {
    REGULAR,
    CHECKERBOARD,
}

export type BlockRawData = {
    biome: BiomeType
    landIndex: number
    level: number
}

export type BlockData = Partial<BlockRawData> & {
    level: number
    type: BlockType
    mode?: BlockMode
}

export type GroundBlockData = {
    // rawVal: number,
    level: number
    biome: BiomeType
    landIndex: number
    landId?: string
    flags: number
}

export type GroundBlock = Block<GroundBlockData>

export type PatchBlock = GroundBlock & {
    index: number
    localPos: Vector3
}

export type SpawnType = string
export const VoidSpawnType = 'void'
export type SpawnProfile = string
export type SpawnPreset = {
    spawnProfile: SpawnProfile,
    spawnCategory: SpawnCategory
}
export type SpawnProfiles = Record<SpawnProfile, SpawnRules>
export type SpawnPresets = Record<SpawnType, SpawnPreset>

export enum SpawnCategory {
    Flora,
    Structure
}

export type SpawnedItems = Record<SpawnType, Vector3[]>

/**
 * CHUNK volume
 *
 *     y
 *     |
 *     |
 *     |_ _ _ x
 *    /
 *   /
 *  z
 *
 * PATCH surface
 *
 *     _ _ _ x (cols)
 *    |
 *    |
 *    |
 *    z (as y) rows
 *
 */

/**
 * Patch surfaces
 */

export enum PatchSides {
    EDGES = 'edge',
    CORNERS = 'corner',
    ALL = 'all',
}

export enum PatchSideId {
    LEFT_EDGE,
    RIGHT_EDGE,
    BOTTOM_EDGE,
    TOP_EDGE,
    BOTTOM_LEFT_CORNER,
    BOTTOM_RIGHT_CORNER,
    TOP_LEFT_CORNER,
    TOP_RIGHT_CORNER,
}

// export type PatchSide = PatchEdge & PatchCorner

// or SurfaceNeighbour
export enum PatchOffsetId {
    XmY0, // left
    XpY0, // right
    X0Ym, // bottom
    X0Yp, // top
    XmYm, // bottom-left
    XpYm, // bottom-right
    XmYp, // top-left
    XpYp, // top-right
}

// export enum SurfaceBounds {
//   R_DOWN, // xM,yM
//   R_UP,   // xM,yP
//   L_UP,   // xP,yP
//   L_DOWN  // xP,yM
// }

export enum PatchBoundId {
    xMyM = 'xMyM',
    xMyP = 'xMyP',
    xPyP = 'xPyP',
    xPyM = 'xPyM',
}

export type PatchBoundingPoints = Record<PatchBoundId, Vector2>

/**
 * Chunk volumes
 */

export enum CubeSide {
    // 6 faces
    FACE_LEFT, // xM
    FACE_RIGHT, // xP
    FACE_DOWN, // yM
    FACE_UP, // yP
    FACE_BACK, // zM
    FACE_FRONT, // zP
    // 12 edges
    EDGE_LEFT_DOWN,
    EDGE_LEFT_UP,
    EDGE_LEFT_BACK,
    EDGE_LEFT_FRONT,
    EDGE_RIGHT_DOWN,
    EDGE_RIGHT_UP,
    EDGE_RIGHT_BACK,
    EDGE_RIGHT_FRONT,
    EDGE_DOWN_BACK,
    EDGE_DOWN_FRONT,
    EDGE_UP_BACK,
    EDGE_UP_FRONT,
    // 8 corners
    CORNER_LEFT_DOWN_BACK,
    CORNER_LEFT_DOWN_FRONT,
    CORNER_LEFT_UP_BACK,
    CORNER_LEFT_UP_FRONT,
    CORNER_RIGHT_DOWN_BACK,
    CORNER_RIGHT_DOWN_FRONT,
    CORNER_RIGHT_UP_BACK,
    CORNER_RIGHT_UP_FRONT,
}

export enum CubeSides {
    FACES = 'faces',
    EDGES = 'edges',
    CORNERS = 'corners',
    ALL = 'all',
}

/**
 * or VolumeNeighbour

 */
export enum CubeOffsetId {
    xMyMzM,
    xMyMz0, // LEFT_DOWN edge
    xMyMzP, // LEFT_UP edge
    xMy0zM, // LEFT_BACK edge
    xMy0z0, // LEFT face
    xMy0zP, // LEFT_FRONT edge
    xMyPzM, // LEFT_UP
    xMyPz0, // LEFT_UP
    xMyPzP, // LEFT_UP
    x0yMzM, // DOWN_BACK
    x0yMz0, // DOWN
    x0yMzP, // DOWN_FRONT
    x0y0zM, // BACK
    x0y0zP, // FRONT
    x0yPzM, // UP_BACK          edge
    x0yPz0, // UP               face
    x0yPzP, // UP_FRONT         edge
    xPyMzM, // RIGHT_DOWN_BACK  corner
    xPyMz0, // RIGHT_DOWN       edge
    xPyMzP, // RIGHT_DOWN_FRONT corner
    xPy0zM, // RIGHT_BACK       edge
    xPy0z0, // RIGHT            face
    xPy0zP, // RIGHT_FRONT      edge
    xPyPzM, // RIGHT_UP_BACK    corner
    xPyPz0, // RIGHT_UP         edge
    xPyPzP, // RIGHT_UP_FRONT   corner
}

export enum ChunkBoundId {
    xMyMzM,
    xMyPzM,
    xPyPzM,
    xPyMzM,
    xMyMzP,
    xMyPzP,
    xPyPzP,
    xPyMzP,
}

/**
 * Cardinal directions
 */

export enum CardinalDirections {
    N,
    E,
    S,
    W,
}

// IntermediaryCardinalDirection
// MidCardinalDir
export enum IntercardinalDirections {
    NE,
    NW,
    SE,
    SW,
}

export type CardinalExtendedDirections = CardinalDirections & IntercardinalDirections

type Point = {
    x: number
    y: number
}

/**
 * External procedural layer conf format
 */
export type ProcLayerExtCfg = {
    seed: string
    spline: Point[]
    blend_weight?: any
    blend_mode?: any
    spread: number
    period?: number
    periodicity?: number
    harmonics: number
    harmonic_gain: number
    harmonic_spread: number
}

export type PatchKey = string
export type PatchId = Vector2Like
export type ChunkKey = string
export type ChunkId = Vector3Like

export type PatchIndex<T> = Record<PatchKey, T>
export type ChunkIndex<T> = Record<ChunkKey, T>

// export enum TerrainType {
//   SEA,
//   BEACH,
//   CLIFF,
//   LOWLANDS,
//   MIDLANDS,
//   HIGHLANDS,
//   MOUNTAINS,
//   MOUNTAINS_TOP,
// }

export type LandConfigId = string // landscape id assigned to noise level
export type BiomeLandKey = string // combination of BiomeType and LandId

type LandBaseFields = {
    x: number // noise value
    y: number // height noise mapping
}

type LandConfigFields = {
    type: BlockType // ground surface
    subtype: BlockType // below ground or mixed with ground surface
    mixratio: number // mixing ratio between type/subtype
    fadein: any
    fadeout: any
}

export type SpawnElement = {
    weight: number
    type: string
    size: number
}

type LandPreprocessedFields = {
    key: BiomeLandKey
    flora: SpawnElement[]
}

type LandRawFields = LandBaseFields & Partial<LandConfigFields> & { flora?: Record<SpawnType, number> }
export type LandFields = LandBaseFields & LandConfigFields & LandPreprocessedFields

// Biome landscapes mappings
export type BiomeLandsConf = Record<LandConfigId, LandRawFields>
export type BiomesRawConf = Record<BiomeType, BiomeLandsConf>
export type BiomeLands = LinkedList<LandFields>
export type BiomesConf = Record<BiomeType, BiomeLands>
