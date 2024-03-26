import { Vector2, Vector3 } from 'three'

import { Stats } from './stats'

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
    Stats.instance.noiseAnomaly(noiseVal)
  }
  return res
}
/**
 * round val at 2 decimals
 */
const round2 = (val: number) => {
  return Math.round(val * 100) / 100
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
enum NeighbourType {
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

const AjacentNeighbours = [
  NeighbourType.xPy0z0,
  NeighbourType.xMy0z0, // right, left
  NeighbourType.x0yPz0,
  NeighbourType.x0yMz0, // top, bottom
  NeighbourType.x0y0zP,
  NeighbourType.x0y0zM, // front, back
]

/**
 *
 * @param pos point position to get neighbours from
 * @param dir neighbour identifier
 * @returns
 */
const getNeighbour = (pos: Vector3, dir: NeighbourType): Vector3 => {
  switch (dir) {
    case NeighbourType.xMyMzM:
      return pos.clone().add(new Vector3(-1, -1, -1))
    case NeighbourType.xMyMz0:
      return pos.clone().add(new Vector3(-1, -1, 0))
    case NeighbourType.xMyMzP:
      return pos.clone().add(new Vector3(-1, -1, 1))
    case NeighbourType.xMy0zM:
      return pos.clone().add(new Vector3(-1, 0, -1))
    case NeighbourType.xMy0z0:
      return pos.clone().add(new Vector3(-1, 0, 0))
    case NeighbourType.xMy0zP:
      return pos.clone().add(new Vector3(-1, 0, 1))
    case NeighbourType.xMyPzM:
      return pos.clone().add(new Vector3(-1, 1, -1))
    case NeighbourType.xMyPz0:
      return pos.clone().add(new Vector3(-1, 1, 0))
    case NeighbourType.xMyPzP:
      return pos.clone().add(new Vector3(-1, 1, 1))
    case NeighbourType.x0yMzM:
      return pos.clone().add(new Vector3(0, -1, -1))
    case NeighbourType.x0yMz0:
      return pos.clone().add(new Vector3(0, -1, 0))
    case NeighbourType.x0yMzP:
      return pos.clone().add(new Vector3(0, -1, 1))
    case NeighbourType.x0y0zM:
      return pos.clone().add(new Vector3(0, 0, -1))
    case NeighbourType.x0y0zP:
      return pos.clone().add(new Vector3(0, 0, 1))
    case NeighbourType.x0yPzM:
      return pos.clone().add(new Vector3(0, 1, -1))
    case NeighbourType.x0yPz0:
      return pos.clone().add(new Vector3(0, 1, 0))
    case NeighbourType.x0yPzP:
      return pos.clone().add(new Vector3(0, 1, 1))
    case NeighbourType.xPyMzM:
      return pos.clone().add(new Vector3(1, -1, -1))
    case NeighbourType.xPyMz0:
      return pos.clone().add(new Vector3(1, -1, 0))
    case NeighbourType.xPyMzP:
      return pos.clone().add(new Vector3(1, -1, 1))
    case NeighbourType.xPy0zM:
      return pos.clone().add(new Vector3(1, 0, -1))
    case NeighbourType.xPy0z0:
      return pos.clone().add(new Vector3(1, 0, 0))
    case NeighbourType.xPy0zP:
      return pos.clone().add(new Vector3(1, 0, 1))
    case NeighbourType.xPyPzM:
      return pos.clone().add(new Vector3(1, 1, -1))
    case NeighbourType.xPyPz0:
      return pos.clone().add(new Vector3(1, 1, 0))
    case NeighbourType.xPyPzP:
      return pos.clone().add(new Vector3(1, 1, 1))
  }
}

const getAllNeighbours = (pos: Vector3): Vector3[] => {
  const neighbours = Object.values(NeighbourType)
    .filter(v => !isNaN(Number(v)))
    .map(type => getNeighbour(pos, type as number))
  return neighbours
}

export {
  sanitiseNoise,
  round2,
  interpolatePoints,
  getAllNeighbours,
  AjacentNeighbours,
  getNeighbour,
}
