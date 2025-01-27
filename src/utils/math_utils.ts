import { Box2, Box3, Vector2, Vector3 } from 'three'

import { PatchBoundId } from './common_types'

/**
 * @param point input point inside bounding box
 * @param points surrounding points which must remain outside bounding box
 * @param bounds
 * @returns largest bounding box including input point while excluding surrounding points
 */
export const findBoundingBox = (
  point: Vector2,
  points: Vector2[],
  bounds: Box2,
) => {
  const { min, max } = bounds.clone()

  for (const p of points) {
    min.x = p.x < point.x ? Math.max(p.x, min.x) : min.x
    min.y = p.y < point.y ? Math.max(p.y, min.y) : min.y
    max.x = p.x > point.x ? Math.min(p.x, max.x) : max.x
    max.y = p.y > point.y ? Math.min(p.y, max.y) : max.y
  }

  const bbox = new Box2(min, max)
  return bbox
}

export const bboxContainsPointXZ = (bbox: Box3, point: Vector3) => {
  return (
    point.x >= bbox.min.x &&
    point.z >= bbox.min.z &&
    point.x < bbox.max.x &&
    point.z < bbox.max.z
  )
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
export const bilinearInterpolation = (
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

export function smoothStep(x: number, min: number, max: number) {
  if (x <= min) return 0
  if (x >= max) return 1
  x = (x - min) / (max - min)
  return x * x * (3 - 2 * x)
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

export const roundToDec = (val: number, n_pow: number) => {
  const num = Math.pow(10, n_pow)
  return Math.round(val * num) / num
}

export const vectRoundToDec = (input: Vector2 | Vector3, n_pow: number) => {
  let { x, y } = input
  x = roundToDec(x, n_pow)
  y = roundToDec(y, n_pow)
  const output =
    input instanceof Vector3
      ? new Vector3(x, y, roundToDec(input.z, n_pow))
      : new Vector2(x, y)
  return output
}

// Clamp number between two values:
export const clamp = (val: number, min: number, max: number) =>
  Math.min(Math.max(val, min), max)
