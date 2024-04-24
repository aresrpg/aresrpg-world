import { Vector2, Vector3 } from 'three'

import { ProcGenStatsReporting } from '../tools/StatsReporting'
import { BlockNeighbour } from './types'

/**
 * Removing out of range values
 * @param noiseVal
 * @returns noiseVal between 0 and 1
 */
const sanitiseNoise = (noiseVal: number) => {
  let res = noiseVal
  const invalidNoiseRange = isNaN(noiseVal) || noiseVal < 0 || noiseVal > 1
  // correct and report noise anomaly
  if (invalidNoiseRange) {
    res = Math.round(noiseVal)
    ProcGenStatsReporting.instance.noiseAnomaly(noiseVal)
  }
  return res
}
/**
 * round val at 2 decimals
 */
const round2 = (val: number) => {
  return Math.round(val * 100) / 100
}

const rnd_dec = (val: number, n_pow: number) => {
  const num = Math.pow(10, n_pow)
  return Math.round(val * num) / num
}

/**
 *
 * @param p1
 * @param p2
 * @param t time between P1 and P2
 */
const interpolatePoints = (p1: Vector2, p2: Vector2, t: number) => {
  // interpolate
  const range: Vector2 = p2.clone().sub(p1)
  const slope = range.x > 0 ? range.y / range.x : 0
  return p1.y + slope * (t - p1.x)
}
/**
 * Direct neighbours e.g.
 * - FRONT/BACK,
 * - TOP/BOTTOM,
 * - LEFT/RIGHT
 */
const AdjacentNeighbours = [
  BlockNeighbour.xPy0z0,
  BlockNeighbour.xMy0z0, // right, left
  BlockNeighbour.x0yPz0,
  BlockNeighbour.x0yMz0, // top, bottom
  BlockNeighbour.x0y0zP,
  BlockNeighbour.x0y0zM, // front, back
]

/**
 *
 * @param pos point position to get neighbours from
 * @param dir neighbour identifier
 * @returns
 */
const getNeighbour = (pos: Vector3, dir: BlockNeighbour): Vector3 => {
  switch (dir) {
    case BlockNeighbour.xMyMzM:
      return pos.clone().add(new Vector3(-1, -1, -1))
    case BlockNeighbour.xMyMz0:
      return pos.clone().add(new Vector3(-1, -1, 0))
    case BlockNeighbour.xMyMzP:
      return pos.clone().add(new Vector3(-1, -1, 1))
    case BlockNeighbour.xMy0zM:
      return pos.clone().add(new Vector3(-1, 0, -1))
    case BlockNeighbour.xMy0z0:
      return pos.clone().add(new Vector3(-1, 0, 0))
    case BlockNeighbour.xMy0zP:
      return pos.clone().add(new Vector3(-1, 0, 1))
    case BlockNeighbour.xMyPzM:
      return pos.clone().add(new Vector3(-1, 1, -1))
    case BlockNeighbour.xMyPz0:
      return pos.clone().add(new Vector3(-1, 1, 0))
    case BlockNeighbour.xMyPzP:
      return pos.clone().add(new Vector3(-1, 1, 1))
    case BlockNeighbour.x0yMzM:
      return pos.clone().add(new Vector3(0, -1, -1))
    case BlockNeighbour.x0yMz0:
      return pos.clone().add(new Vector3(0, -1, 0))
    case BlockNeighbour.x0yMzP:
      return pos.clone().add(new Vector3(0, -1, 1))
    case BlockNeighbour.x0y0zM:
      return pos.clone().add(new Vector3(0, 0, -1))
    case BlockNeighbour.x0y0zP:
      return pos.clone().add(new Vector3(0, 0, 1))
    case BlockNeighbour.x0yPzM:
      return pos.clone().add(new Vector3(0, 1, -1))
    case BlockNeighbour.x0yPz0:
      return pos.clone().add(new Vector3(0, 1, 0))
    case BlockNeighbour.x0yPzP:
      return pos.clone().add(new Vector3(0, 1, 1))
    case BlockNeighbour.xPyMzM:
      return pos.clone().add(new Vector3(1, -1, -1))
    case BlockNeighbour.xPyMz0:
      return pos.clone().add(new Vector3(1, -1, 0))
    case BlockNeighbour.xPyMzP:
      return pos.clone().add(new Vector3(1, -1, 1))
    case BlockNeighbour.xPy0zM:
      return pos.clone().add(new Vector3(1, 0, -1))
    case BlockNeighbour.xPy0z0:
      return pos.clone().add(new Vector3(1, 0, 0))
    case BlockNeighbour.xPy0zP:
      return pos.clone().add(new Vector3(1, 0, 1))
    case BlockNeighbour.xPyPzM:
      return pos.clone().add(new Vector3(1, 1, -1))
    case BlockNeighbour.xPyPz0:
      return pos.clone().add(new Vector3(1, 1, 0))
    case BlockNeighbour.xPyPzP:
      return pos.clone().add(new Vector3(1, 1, 1))
  }
}

const getAllNeighbours = (pos: Vector3): Vector3[] => {
  const neighbours = Object.values(BlockNeighbour)
    .filter(v => !isNaN(Number(v)))
    .map(type => getNeighbour(pos, type as number))
  return neighbours
}

// Clamp number between two values:
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max)


export {
  sanitiseNoise,
  round2,
  rnd_dec,
  interpolatePoints,
  getAllNeighbours,
  AdjacentNeighbours,
  getNeighbour,
  clamp
}
