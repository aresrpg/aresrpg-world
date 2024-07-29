import { Vector3 } from 'three'

import { BiomeType, BlockType } from '../procgen/Biome'

import { LinkedList } from './misc'

export type Block = {
  pos: Vector3
  type: BlockType
}

export enum Adjacent2dPos {
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

export enum Adjacent3dPos {
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

export interface MappingData {
  grounds: BlockType[] // which types of ground can be here
  entities: string[] // which type of entities can spawn
  amplitude: {
    // amplitude used in blocks randomization
    low: number
    high: number
  }
}

export interface MappingRange extends Partial<MappingData> {
  x: number // noise
  y: number // noise mapping
}

export type MappingConf = Record<string, MappingRange>
export type MappingRanges = LinkedList<MappingRange>
export type BiomeConf = Record<BiomeType, MappingConf>
export type BiomeMappings = Record<BiomeType, MappingRanges>

export enum EntityType {
  NONE = '',
  TREE_APPLE = 'apple_tree',
  TREE_PINE = 'pine_tree',
}
