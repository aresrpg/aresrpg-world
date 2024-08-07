import { Box3, Vector2, Vector3 } from 'three'

import {
  Adjacent2dPos,
  Adjacent3dPos,
  MappingRange,
  MappingRanges,
} from './types'

// Clamp number between two values:
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)

const roundToDec = (val: number, n_pow: number) => {
  const num = Math.pow(10, n_pow)
  return Math.round(val * num) / num
}

// const MappingRangeFinder = (item: LinkedList<MappingData>, inputVal: number) => item.next && inputVal > (item.next.data as MappingData).x
export const MappingRangeSorter = (item1: MappingRange, item2: MappingRange) =>
  item1.x - item2.x

/**
 * find element with inputVal withing interpolation range
 * @param inputVal
 * @returns
 */
const findMatchingRange = (inputVal: number, mappingRanges: MappingRanges) => {
  let match = mappingRanges.first()
  while (match.next && inputVal > match.next.data.x) {
    match = match.next
  }
  return match
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
const AdjacentNeighbours3d = [
  Adjacent3dPos.xPy0z0,
  Adjacent3dPos.xMy0z0, // right, left
  Adjacent3dPos.x0yPz0,
  Adjacent3dPos.x0yMz0, // top, bottom
  Adjacent3dPos.x0y0zP,
  Adjacent3dPos.x0y0zM, // front, back
]

const getAdjacent2dCoords = (pos: Vector2, dir: Adjacent2dPos): Vector2 => {
  switch (dir) {
    case Adjacent2dPos.center:
      return pos.clone()
    case Adjacent2dPos.left:
      return pos.clone().add(new Vector2(-1, 0))
    case Adjacent2dPos.right:
      return pos.clone().add(new Vector2(1, 0))
    case Adjacent2dPos.top:
      return pos.clone().add(new Vector2(0, 1))
    case Adjacent2dPos.bottom:
      return pos.clone().add(new Vector2(0, -1))
    case Adjacent2dPos.topleft:
      return pos.clone().add(new Vector2(-1, 1))
    case Adjacent2dPos.topright:
      return pos.clone().add(new Vector2(1, 1))
    case Adjacent2dPos.bottomright:
      return pos.clone().add(new Vector2(-1, -1))
    case Adjacent2dPos.bottomleft:
      return pos.clone().add(new Vector2(1, -1))
  }
}

/**
 *
 * @param pos point position to get neighbours from
 * @param dir neighbour identifier
 * @returns
 */
const getAdjacent3dCoords = (pos: Vector3, dir: Adjacent3dPos): Vector3 => {
  switch (dir) {
    case Adjacent3dPos.xMyMzM:
      return pos.clone().add(new Vector3(-1, -1, -1))
    case Adjacent3dPos.xMyMz0:
      return pos.clone().add(new Vector3(-1, -1, 0))
    case Adjacent3dPos.xMyMzP:
      return pos.clone().add(new Vector3(-1, -1, 1))
    case Adjacent3dPos.xMy0zM:
      return pos.clone().add(new Vector3(-1, 0, -1))
    case Adjacent3dPos.xMy0z0:
      return pos.clone().add(new Vector3(-1, 0, 0))
    case Adjacent3dPos.xMy0zP:
      return pos.clone().add(new Vector3(-1, 0, 1))
    case Adjacent3dPos.xMyPzM:
      return pos.clone().add(new Vector3(-1, 1, -1))
    case Adjacent3dPos.xMyPz0:
      return pos.clone().add(new Vector3(-1, 1, 0))
    case Adjacent3dPos.xMyPzP:
      return pos.clone().add(new Vector3(-1, 1, 1))
    case Adjacent3dPos.x0yMzM:
      return pos.clone().add(new Vector3(0, -1, -1))
    case Adjacent3dPos.x0yMz0:
      return pos.clone().add(new Vector3(0, -1, 0))
    case Adjacent3dPos.x0yMzP:
      return pos.clone().add(new Vector3(0, -1, 1))
    case Adjacent3dPos.x0y0zM:
      return pos.clone().add(new Vector3(0, 0, -1))
    case Adjacent3dPos.x0y0zP:
      return pos.clone().add(new Vector3(0, 0, 1))
    case Adjacent3dPos.x0yPzM:
      return pos.clone().add(new Vector3(0, 1, -1))
    case Adjacent3dPos.x0yPz0:
      return pos.clone().add(new Vector3(0, 1, 0))
    case Adjacent3dPos.x0yPzP:
      return pos.clone().add(new Vector3(0, 1, 1))
    case Adjacent3dPos.xPyMzM:
      return pos.clone().add(new Vector3(1, -1, -1))
    case Adjacent3dPos.xPyMz0:
      return pos.clone().add(new Vector3(1, -1, 0))
    case Adjacent3dPos.xPyMzP:
      return pos.clone().add(new Vector3(1, -1, 1))
    case Adjacent3dPos.xPy0zM:
      return pos.clone().add(new Vector3(1, 0, -1))
    case Adjacent3dPos.xPy0z0:
      return pos.clone().add(new Vector3(1, 0, 0))
    case Adjacent3dPos.xPy0zP:
      return pos.clone().add(new Vector3(1, 0, 1))
    case Adjacent3dPos.xPyPzM:
      return pos.clone().add(new Vector3(1, 1, -1))
    case Adjacent3dPos.xPyPz0:
      return pos.clone().add(new Vector3(1, 1, 0))
    case Adjacent3dPos.xPyPzP:
      return pos.clone().add(new Vector3(1, 1, 1))
  }
}

const getAllNeighbours2dCoords = (pos: Vector2): Vector2[] => {
  const neighbours = Object.values(Adjacent3dPos)
    .filter(v => !isNaN(Number(v)))
    .map(type => getAdjacent2dCoords(pos, type as number))
  return neighbours
}

const getAllNeighbours3dCoords = (pos: Vector3): Vector3[] => {
  const neighbours = Object.values(Adjacent3dPos)
    .filter(v => !isNaN(Number(v)))
    .map(type => getAdjacent3dCoords(pos, type as number))
  return neighbours
}

const getPatchPoints = (patchBBox: Box3, clearY = true) => {
  const { min, max } = patchBBox.clone()
  if (clearY) {
    min.y = 0
    max.y = 0
  }
  const minXmaxZ = min.clone()
  minXmaxZ.z = max.z
  const maxXminZ = min.clone()
  maxXminZ.x = max.x
  const points = [min, max, minXmaxZ, maxXminZ]
  return points
}

const bboxContainsPointXZ = (bbox: Box3, point: Vector3) => {
  return (
    point.x >= bbox.min.x &&
    point.z >= bbox.min.z &&
    point.x < bbox.max.x &&
    point.z < bbox.max.z
  )
}

export {
  roundToDec,
  clamp,
  findMatchingRange,
  interpolatePoints,
  AdjacentNeighbours3d,
  getAdjacent2dCoords,
  getAdjacent3dCoords,
  getAllNeighbours2dCoords,
  getAllNeighbours3dCoords,
  bboxContainsPointXZ,
  getPatchPoints,
}
