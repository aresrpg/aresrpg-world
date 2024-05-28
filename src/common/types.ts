import { Vector3 } from 'three'

import { BiomeType, BlockType } from '../procgen/Biome'
import { TreeData } from '../procgen/Vegetation'

import { LinkedList } from './misc'

export type Block = {
  pos: Vector3
  type: BlockType
}

export enum BlockNeighbour {
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
  x: number // noise
  y: number // noise mapping
  blockType?: {
    primary: BlockType // nominal block type,
    secondary: BlockType
  }
  amplitude?: {
    // random amplitude used in blocks randomization
    low: number
    high: number
  }
  vegetation?: string[] // specifies wether a tree can spawn or not
}

export type BlockGenData = {
  biome: BiomeType
  tree: Partial<TreeData>
  raw: number
}

export type MappingConf = Record<string, MappingData>
export type MappingRanges = LinkedList<MappingData>
export type BiomeConf = Record<BiomeType, MappingConf>
export type BiomeMappings = Record<BiomeType, MappingRanges>
