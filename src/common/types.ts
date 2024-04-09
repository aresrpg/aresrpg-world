import { Vector3 } from 'three'

export enum BlockType {
  NONE,
  WATER,
  SAND,
  GRASS,
  DRY_GRASS,
  MUD,
  ROCK,
  SNOW,
}

export type Block = {
  pos: Vector3
  type: BlockType
}

export type TerrainBlocksMapping = {
  blockType: BlockType
  threshold: number
  randomness: {
    low: number,
    high: number
  }
}

export type TerrainMapping = Record<any, TerrainBlocksMapping>

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
