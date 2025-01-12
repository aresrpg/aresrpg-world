import { Vector2, Vector3 } from 'three'

import { GroundBlockData } from '../processing/GroundPatch'
import { BiomeType, BlockType } from '../procgen/Biome'
import { LinkedList } from '../datacontainers/LinkedList'
import { ItemType } from '../factory/ItemsFactory'

export type Block<T> = {
  pos: Vector3
  data: T
}

export enum BlockMode {
  REGULAR,
  CHECKERBOARD,
}

export type BlockData = {
  level: number
  type: BlockType
  mode?: BlockMode
}

export type GroundBlock = Block<GroundBlockData>

export type PatchBlock = GroundBlock & {
  index: number
  localPos: Vector3
}

export enum CardinalDirections {
  N,
  E,
  S,
  W,
}

export enum IntercardinalDirections {
  NE,
  NW,
  SE,
  SW,
}

export type AllCardinalDirections = CardinalDirections | IntercardinalDirections

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

export enum SurfaceNeighbour {
  center,
  left,
  right,
  top,
  bottom,
  topleft,
  topright,
  bottomleft,
  bottomright,
}

export enum VolumeNeighbour {
  xMyMzM,
  xMyMz0,
  xMyMzP,
  xMy0zM,
  xMy0z0,
  xMy0zP,
  xMyPzM,
  xMyPz0,
  xMyPzP,
  x0yMzM,
  x0yMz0,
  x0yMzP,
  x0y0zM,
  x0y0zP,
  x0yPzM,
  x0yPz0,
  x0yPzP,
  xPyMzM,
  xPyMz0,
  xPyMzP,
  xPy0zM,
  xPy0z0,
  xPy0zP,
  xPyPzM,
  xPyPz0,
  xPyPzP,
}

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
export type PatchId = Vector2
export type ChunkKey = string
export type ChunkId = Vector3

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

export type LandscapeId = string // landscape id assigned to noise level
export type BiomeLandscapeKey = string // combination of biomeType and LandscapeId

export type LandscapeFields = {
  key: BiomeLandscapeKey
  x: number // noise value
  y: number // height noise mapping
  type: BlockType // ground surface
  subtype: BlockType // below ground or mixed with ground surface
  mixratio: number // mixing ratio between type/subtype
  flora?: Record<ItemType, number>
  fadein: any
  fadeout: any
}

// Biome landscapes mappings
export type LandscapesRawConf = Record<LandscapeId, Partial<LandscapeFields>>
export type BiomesRawConf = Record<BiomeType, LandscapesRawConf>
export type LandscapesConf = LinkedList<LandscapeFields>
export type BiomesConf = Record<BiomeType, LandscapesConf>
