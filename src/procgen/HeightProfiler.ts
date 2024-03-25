import { Vector2 } from 'three'

import * as Utils from '../common/utils'

export type CurveParams = {
  x: number
  y: number
}

/**
 * Profile used to map scalar field to terrain height
 */
class HeightProfiler {
  curveParams: CurveParams[]
  constructor(curveParams: CurveParams[]) {
    this.curveParams = curveParams
  }

  getCurveSegment(inputVal: any) {
    try {
      return getCurveSegment(inputVal, this.curveParams)
    } catch (error) {
      return getCurveSegment(Utils.sanitiseNoise(inputVal), this.curveParams)
    }
  }

  apply(inputVal: number) {
    return noiseToHeight(inputVal, this.getCurveSegment(inputVal))
  }
}

/**
 *
 * @param noise input val
 * @param curveProfile curve points array
 * @returns upper and lower points from curve profile closest to input val
 */
const getCurveSegment = (noise: number, curveProfile: CurveParams[]) => {
  const lower = curveProfile
    .filter((point: CurveParams) => point.x <= noise)
    .reduce((last: CurveParams, curr: CurveParams) => {
      const currDiff = Math.abs(noise - curr.x)
      const lastDiff = Math.abs(noise - last.x)
      return currDiff < lastDiff ? curr : last
    })
  const upper = curveProfile
    .filter((point: CurveParams) => point.x >= noise)
    .reduce((last: CurveParams, curr: CurveParams) => {
      const currDiff = Math.abs(noise - curr.x)
      const lastDiff = Math.abs(noise - last.x)
      return currDiff < lastDiff ? curr : last
    })
  return { lower, upper }
}

/**
 * mapping noise to height value
 * @param noise ranging from 0 to 1
 * @param curveProfile noise to height curve mapping
 * @returns height ranging from 0 to 255
 */
const noiseToHeight = (
  noiseVal: number,
  curveSegment: { lower: any; upper: any },
) => {
  const { lower, upper } = curveSegment
  const lowerPoint = new Vector2(lower.x, lower.y)
  const upperPoint = new Vector2(upper.x, upper.y)
  const interpolatedHeight = Utils.interpolatePoints(
    lowerPoint,
    upperPoint,
    noiseVal,
  )
  return interpolatedHeight
}

/**
 *  Curve parameters presets
 */
// const DefaultProfiles: any = {
//   identity: [
//     {
//       x: 0,
//       y: 0,
//     },
//     {
//       x: 1,
//       y: 1,
//     },
//   ],
//   regular: [
//     {
//       x: 0,
//       y: 0,
//     },
//     {
//       x: 1,
//       y: 255,
//     },
//   ]
// }

export { HeightProfiler }
