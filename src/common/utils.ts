import { Box2, Box3, Vector2, Vector2Like, Vector3, Vector3Like } from 'three'
import { WorldConf } from '../index'

import {
  Adjacent2dPos,
  Adjacent3dPos,
  ChunkId,
  ChunkKey,
  MappingRange,
  MappingRanges,
  PatchId,
  PatchKey,
} from './types'

// Clamp number between two values:
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)

const roundToDec = (val: number, n_pow: number) => {
  const num = Math.pow(10, n_pow)
  return Math.round(val * num) / num
}

const vectRoundToDec = (input: Vector2 | Vector3, n_pow: number) => {
  let { x, y } = input
  x = roundToDec(x, n_pow)
  y = roundToDec(y, n_pow)
  const output =
    input instanceof Vector3
      ? new Vector3(x, y, roundToDec(input.z, n_pow))
      : new Vector2(x, y)
  return output
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

const asVect2 = (v3: Vector3) => {
  return new Vector2(v3.x, v3.z)
}

const asVect3 = (v2: Vector2, yVal = 0) => {
  return new Vector3(v2.x, yVal, v2.y)
}

const asBox2 = (box3: Box3) => {
  return new Box2(asVect2(box3.min), asVect2(box3.max))
}

const asBox3 = (box2: Box2) => {
  return new Box3(asVect3(box2.min), asVect3(box2.max))
}

const isVect2Stub = (stub: Vector2Like) => {
  return (
    stub !== undefined &&
    stub.x !== undefined &&
    stub.y !== undefined &&
    stub.z === undefined
  )
}

const isVect3Stub = (stub: Vector3Like) => {
  return (
    stub !== undefined &&
    stub.x !== undefined &&
    stub.y !== undefined &&
    stub.z !== undefined
  )
}

const parseVect3Stub = (stub: Vector3Like) => {
  let res
  if (isVect3Stub(stub)) {
    res = new Vector3(...Object.values(stub))
  }
  return res
}

const parseVect2Stub = (stub: Vector2Like) => {
  let res
  if (isVect2Stub(stub)) {
    res = new Vector2(...Object.values(stub))
  }
  return res
}

const parseBox2Stub = (stub: Box2) => {
  let res
  if (isVect2Stub(stub.min) && isVect2Stub(stub.max)) {
    const min = parseVect2Stub(stub.min)
    const max = parseVect2Stub(stub.max)
    res = new Box2(min, max)
  }
  return res
}

const parseBox3Stub = (stub: Box3) => {
  let res
  if (isVect3Stub(stub.min) && isVect3Stub(stub.max)) {
    const min = parseVect3Stub(stub.min)
    const max = parseVect3Stub(stub.max)
    res = new Box3(min, max)
  }
  return res
}

const parseThreeStub = (stub: any) => {
  return stub ? parseBox3Stub(stub) || parseVect3Stub(stub)
    || parseBox2Stub(stub) || parseVect2Stub(stub)
    || stub : stub
}

const parsePatchKey = (patchKey: PatchKey) => {
  const patchId = new Vector2(
    parseInt(patchKey.split(':')[0] as string),
    parseInt(patchKey.split(':')[1] as string),
  )
  return patchId
}

const getPatchId = (position: Vector2, patchSize: Vector2) => {
  const patchId = position.clone().divide(patchSize).floor()
  return patchId
}

const patchUpperId = (position: Vector2, patchSize: Vector2) => {
  const patchId = position.clone().divide(patchSize).ceil()
  return patchId
}

const serializePatchId = (patchId: PatchId) => {
  const { x, y } = patchId
  const patchKey = `${x}:${y}`
  return patchKey
}

const patchBoxFromKey = (patchKey: string, patchDims: Vector2) => {
  const patchCoords = parsePatchKey(patchKey)
  const bmin = patchCoords.clone().multiply(patchDims)
  const bmax = patchCoords.clone().addScalar(1).multiply(patchDims)
  const bbox = new Box2(bmin, bmax)
  return bbox
}

const parseChunkKey = (chunkKey: ChunkKey) => {
  const chunkId = new Vector3(
    parseInt(chunkKey.split('_')[1] as string),
    parseInt(chunkKey.split('_')[2] as string),
    parseInt(chunkKey.split('_')[3] as string),
  )
  return chunkId
}

const serializeChunkId = (chunkId: Vector3) => {
  return `chunk_${chunkId.x}_${chunkId.y}_${chunkId.z}`
}

function genChunkIds(patchId: PatchId, ymin: number, ymax: number) {
  const chunk_ids = []
  for (let y = ymax; y >= ymin; y--) {
    const chunk_coords = asVect3(patchId, y)
    chunk_ids.push(chunk_coords)
  }
  return chunk_ids
}

const chunkBoxFromId = (
  chunkId: ChunkId,
  patchSize: number = WorldConf.patchSize,
) => {
  const bmin = chunkId.clone().multiplyScalar(patchSize)
  const bmax = chunkId.clone().addScalar(1).multiplyScalar(patchSize)
  const chunkBbox = new Box3(bmin, bmax)
  chunkBbox.expandByScalar(1)
  return chunkBbox
}

export {
  roundToDec,
  vectRoundToDec,
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
  parseThreeStub,
  asVect2,
  asVect3,
  asBox2,
  asBox3,
  parsePatchKey,
  getPatchId,
  patchUpperId,
  serializePatchId,
  patchBoxFromKey,
  parseChunkKey,
  serializeChunkId,
  chunkBoxFromId,
  genChunkIds,
}
