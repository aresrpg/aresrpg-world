import { Box2, Box3, Vector2, Vector2Like, Vector3, Vector3Like } from 'three'

import {
  SurfaceNeighbour,
  VolumeNeighbour,
  ChunkKey,
  PatchId,
  PatchKey,
  PatchBoundId,
  PatchBoundingPoints,
  LandscapeFields,
  LandscapesConf,
} from './types'

const typesNumbering = (types: Record<string, number>, offset = 0) =>
  Object.keys(types).forEach((key, i) => (types[key] = offset + i))

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

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// const MappingRangeFinder = (item: LinkedList<MappingData>, inputVal: number) => item.next && inputVal > (item.next.data as MappingData).x
export const MappingRangeSorter = (
  item1: LandscapeFields,
  item2: LandscapeFields,
) => item1.x - item2.x

/**
 * find element with inputVal withing interpolation range
 * @param inputVal
 * @returns
 */
const findMatchingRange = (inputVal: number, noiseMappings: LandscapesConf) => {
  let match = noiseMappings.first()
  let i = 1
  while (match.next && inputVal > match.next.data.x) {
    match = match.next
    i++
  }
  return i
}

/**
 *
 * y2 - p12-----p22
 *       |   + p |
 *       |       |
 * y1 - p11-----p21
 *       |       |
 *       x1      x2
 *
 * @param p
 * @param p11
 * @param p12
 * @param p22
 * @param p21
 * @returns
 */
const bilinearInterpolation = (
  p: Vector2,
  bounds: Box2,
  boundingVals: Record<PatchBoundId, Record<string, number>>,
) => {
  const { x, y } = p
  const { x: x1, y: y1 } = bounds.min
  const { x: x2, y: y2 } = bounds.max
  const dims = bounds.getSize(new Vector2())

  const sumComponents = (
    componentKey: string,
    values: Record<string, number>[],
  ) => {
    return values.reduce((sum, val) => sum + (val[componentKey] || 0), 0)
  }
  const add = (...items: Record<string, number>[]) => {
    const res: any = {}
    const [first] = items
    first && Object.keys(first).forEach(k => (res[k] = sumComponents(k, items)))
    return res
  }

  const mul = (v: Record<string, number>, w: number) => {
    const res = { ...v }
    Object.keys(res).forEach(k => (res[k] = (res[k] as number) * w))
    return res
  }
  const divider = dims.x * dims.y // common divider
  const w11 = ((x2 - x) * (y2 - y)) / divider
  const w12 = ((x2 - x) * (y - y1)) / divider
  const w21 = ((x - x1) * (y2 - y)) / divider
  const w22 = ((x - x1) * (y - y1)) / divider
  const m11 = mul(boundingVals.xMyM, w11)
  const m12 = mul(boundingVals.xMyP, w12)
  const m21 = mul(boundingVals.xPyM, w21)
  const m22 = mul(boundingVals.xPyP, w22)
  const res = add(m11, m12, m21, m22)
  return res
}

/**
 * Inverse distance weighting (IDW)
 * @param cornersPoints
 * @param point
 */
// const invDistWeighting = (cornerPointsValues: [p: Vector2, v: any][], point: Vector2) => {
//   const [firstItem] = cornerPointsValues
//   const [, firstVal] = firstItem || []
//   const initVal = { ...firstVal }
//   Object.keys(initVal).forEach(key => initVal[key] = 0)
//   let totalWeight = 0
//   const idwInterpolation = cornerPointsValues.reduce((weightedSum, [p, v]) => {
//     const d = point.distanceTo(p)
//     const w = d > 0 ? 1 / d : 1
//     Object.keys(weightedSum).forEach(k => weightedSum[k] += w * v[k])
//     totalWeight += w
//     return weightedSum
//   }, initVal)
//   Object.keys(idwInterpolation).forEach(key => idwInterpolation[key] = idwInterpolation[key] / totalWeight)
//   return idwInterpolation
// }

/**
 * Orthogonal or direct 2D neighbours e.g.
 * - TOP/BOTTOM,
 * - LEFT/RIGHT
 */
const directNeighbours2D = [
  SurfaceNeighbour.left,
  SurfaceNeighbour.right,
  SurfaceNeighbour.top,
  SurfaceNeighbour.bottom,
]

/**
 * Orthogonal or direct 3D neighbours e.g.
 * - FRONT/BACK,
 * - TOP/BOTTOM,
 * - LEFT/RIGHT
 */
const directNeighbours3D = [
  VolumeNeighbour.xPy0z0,
  VolumeNeighbour.xMy0z0, // right, left
  VolumeNeighbour.x0yPz0,
  VolumeNeighbour.x0yMz0, // top, bottom
  VolumeNeighbour.x0y0zP,
  VolumeNeighbour.x0y0zM, // front, back
]

const getAdjacent2dCoords = (pos: Vector2, dir: SurfaceNeighbour): Vector2 => {
  switch (dir) {
    case SurfaceNeighbour.center:
      return pos.clone()
    case SurfaceNeighbour.left:
      return pos.clone().add(new Vector2(-1, 0))
    case SurfaceNeighbour.right:
      return pos.clone().add(new Vector2(1, 0))
    case SurfaceNeighbour.top:
      return pos.clone().add(new Vector2(0, 1))
    case SurfaceNeighbour.bottom:
      return pos.clone().add(new Vector2(0, -1))
    case SurfaceNeighbour.topleft:
      return pos.clone().add(new Vector2(-1, 1))
    case SurfaceNeighbour.topright:
      return pos.clone().add(new Vector2(1, 1))
    case SurfaceNeighbour.bottomright:
      return pos.clone().add(new Vector2(-1, -1))
    case SurfaceNeighbour.bottomleft:
      return pos.clone().add(new Vector2(1, -1))
  }
}

/**
 *
 * @param pos point position to get neighbours from
 * @param dir neighbour identifier
 * @returns
 */
const getAdjacent3dCoords = (pos: Vector3, dir: VolumeNeighbour): Vector3 => {
  switch (dir) {
    case VolumeNeighbour.xMyMzM:
      return pos.clone().add(new Vector3(-1, -1, -1))
    case VolumeNeighbour.xMyMz0:
      return pos.clone().add(new Vector3(-1, -1, 0))
    case VolumeNeighbour.xMyMzP:
      return pos.clone().add(new Vector3(-1, -1, 1))
    case VolumeNeighbour.xMy0zM:
      return pos.clone().add(new Vector3(-1, 0, -1))
    case VolumeNeighbour.xMy0z0:
      return pos.clone().add(new Vector3(-1, 0, 0))
    case VolumeNeighbour.xMy0zP:
      return pos.clone().add(new Vector3(-1, 0, 1))
    case VolumeNeighbour.xMyPzM:
      return pos.clone().add(new Vector3(-1, 1, -1))
    case VolumeNeighbour.xMyPz0:
      return pos.clone().add(new Vector3(-1, 1, 0))
    case VolumeNeighbour.xMyPzP:
      return pos.clone().add(new Vector3(-1, 1, 1))
    case VolumeNeighbour.x0yMzM:
      return pos.clone().add(new Vector3(0, -1, -1))
    case VolumeNeighbour.x0yMz0:
      return pos.clone().add(new Vector3(0, -1, 0))
    case VolumeNeighbour.x0yMzP:
      return pos.clone().add(new Vector3(0, -1, 1))
    case VolumeNeighbour.x0y0zM:
      return pos.clone().add(new Vector3(0, 0, -1))
    case VolumeNeighbour.x0y0zP:
      return pos.clone().add(new Vector3(0, 0, 1))
    case VolumeNeighbour.x0yPzM:
      return pos.clone().add(new Vector3(0, 1, -1))
    case VolumeNeighbour.x0yPz0:
      return pos.clone().add(new Vector3(0, 1, 0))
    case VolumeNeighbour.x0yPzP:
      return pos.clone().add(new Vector3(0, 1, 1))
    case VolumeNeighbour.xPyMzM:
      return pos.clone().add(new Vector3(1, -1, -1))
    case VolumeNeighbour.xPyMz0:
      return pos.clone().add(new Vector3(1, -1, 0))
    case VolumeNeighbour.xPyMzP:
      return pos.clone().add(new Vector3(1, -1, 1))
    case VolumeNeighbour.xPy0zM:
      return pos.clone().add(new Vector3(1, 0, -1))
    case VolumeNeighbour.xPy0z0:
      return pos.clone().add(new Vector3(1, 0, 0))
    case VolumeNeighbour.xPy0zP:
      return pos.clone().add(new Vector3(1, 0, 1))
    case VolumeNeighbour.xPyPzM:
      return pos.clone().add(new Vector3(1, 1, -1))
    case VolumeNeighbour.xPyPz0:
      return pos.clone().add(new Vector3(1, 1, 0))
    case VolumeNeighbour.xPyPzP:
      return pos.clone().add(new Vector3(1, 1, 1))
  }
}

const getNeighbours2D = (
  pos: Vector2,
  directNeighboursOnly = false,
): Vector2[] => {
  const neighbours = directNeighboursOnly
    ? directNeighbours2D
    : Object.values(SurfaceNeighbour).filter(v => !isNaN(Number(v)))
  return neighbours.map(type => getAdjacent2dCoords(pos, type as number))
}

const getNeighbours3D = (
  pos: Vector3,
  directNeighboursOnly = false,
): Vector3[] => {
  const neighbours = directNeighboursOnly
    ? directNeighbours3D
    : Object.values(VolumeNeighbour).filter(v => !isNaN(Number(v)))
  return neighbours.map(type => getAdjacent3dCoords(pos, type as number))
}

const getPatchBoundingPoints = (bounds: Box2) => {
  const { min: xMyM, max: xPyP } = bounds
  const xMyP = xMyM.clone()
  xMyP.y = xPyP.y
  const xPyM = xMyM.clone()
  xPyM.x = xPyP.x
  const points: PatchBoundingPoints = { xMyM, xMyP, xPyM, xPyP }
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

const asBox3 = (box2: Box2, ymin = 0, ymax = 0) => {
  return new Box3(asVect3(box2.min, ymin), asVect3(box2.max, ymax))
}

const isVect2Stub = (stub: Vector2Like) => {
  return (
    stub !== undefined &&
    stub.x !== undefined &&
    stub.y !== undefined &&
    (stub as any).z === undefined
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
  return stub
    ? parseBox3Stub(stub) ||
    parseVect3Stub(stub) ||
    parseBox2Stub(stub) ||
    parseVect2Stub(stub) ||
    stub
    : stub
}

const parsePatchKey = (patchKey: PatchKey) => {
  let patchId
  if (patchKey?.length > 0) {
    patchId = new Vector2(
      parseInt(patchKey.split(':')[0] as string),
      parseInt(patchKey.split(':')[1] as string),
    )
  }
  return patchId
}

const patchUpperId = (position: Vector2, patchSize: Vector2) => {
  const patchId = position.clone().divide(patchSize).ceil()
  return patchId
}

const serializePatchId = (patchId: PatchId | undefined) => {
  let patchKey = ''
  if (patchId) {
    const { x, y } = patchId
    patchKey = `${x}:${y}`
  }
  return patchKey
}

const patchBoxFromKey = (patchKey: string, patchDims: Vector2) => {
  const patchCoords = parsePatchKey(patchKey)
  const bbox = new Box2()
  if (patchCoords) {
    bbox.min = patchCoords.clone().multiply(patchDims)
    bbox.max = patchCoords.clone().addScalar(1).multiply(patchDims)
  }
  return bbox
}

const getPatchId = (position: Vector2, patchSize: Vector2) => {
  const patchId = position.clone().divide(patchSize).floor()
  return patchId
}

const getPatchRange = (bounds: Box2, patchDims: Vector2) => {
  const rangeMin = getPatchId(bounds.min, patchDims)
  const rangeMax = patchUpperId(bounds.max, patchDims) // .addScalar(1)
  const patchRange = new Box2(rangeMin, rangeMax)
  return patchRange
}

const getPatchIds = (bounds: Box2, patchDims: Vector2) => {
  const patchIds = []
  const patchRange = getPatchRange(bounds, patchDims)
  // iter elements on computed range
  const { min, max } = patchRange
  for (let { y } = min; y <= max.y; y++) {
    for (let { x } = min; x <= max.x; x++) {
      patchIds.push(new Vector2(x, y))
    }
  }
  return patchIds
}

const getRoundedBox = (bounds: Box2, patchDims: Vector2) => {
  const { min, max } = getPatchRange(bounds, patchDims)
  min.multiply(patchDims)
  max.multiply(patchDims)
  const extBbox = new Box2(min, max)
  return extBbox
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

const chunkBoxFromKey = (chunkKey: string, chunkDims: Vector3) => {
  const chunkId = parseChunkKey(chunkKey)
  const bbox = new Box3()
  if (chunkId) {
    bbox.min = chunkId.clone().multiply(chunkDims)
    bbox.max = chunkId.clone().addScalar(1).multiply(chunkDims)
  }
  return bbox
}

export {
  typesNumbering,
  roundToDec,
  vectRoundToDec,
  smoothstep,
  clamp,
  findMatchingRange,
  bilinearInterpolation,
  getNeighbours2D,
  getNeighbours3D,
  bboxContainsPointXZ,
  getPatchBoundingPoints,
  parseThreeStub,
  asVect2,
  asVect3,
  asBox2,
  asBox3,
  parsePatchKey,
  getPatchId,
  patchUpperId,
  serializePatchId,
  getPatchRange,
  getPatchIds,
  getRoundedBox,
  patchBoxFromKey,
  parseChunkKey,
  serializeChunkId,
  chunkBoxFromKey,
  genChunkIds,
}
