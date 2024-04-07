import { Vector2 } from 'three'

import * as Utils from '../common/utils'
import { LinkedList } from '../common/misc'

export type CurveParams = {
  x: number
  y: number
}

/**
 * Profile used to map scalar field to terrain height
 */
class HeightProfiler {
  curveParams: LinkedList<CurveParams>
  constructor(curveParams: LinkedList<CurveParams>) {
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

  static fromArray(curveParams: CurveParams[]): HeightProfiler {
    const linkedCurveParams = LinkedList.fromArray<CurveParams>(
      curveParams,
      (a, b) => a.x - b.x,
    )
    return new HeightProfiler(linkedCurveParams)
  }
}

/**
 *
 * @param noise input val
 * @param curveProfile curve points array
 * @returns upper and lower points from curve profile closest to input val
 */
const getCurveSegment = (
  noise: number,
  curveProfile: LinkedList<CurveParams>,
) => {
  let curveSegment = curveProfile
  while (curveSegment.next && curveSegment.next.data.x < noise) {
    curveSegment = curveSegment.next
  }
  return curveSegment
}

/**
 * mapping noise to height value
 * @param noise ranging from 0 to 1
 * @param curveProfile noise to height curve mapping
 * @returns height ranging from 0 to 255
 */
const noiseToHeight = (
  noiseVal: number,
  curveSegment: LinkedList<CurveParams>,
) => {
  const upper = curveSegment.next || curveSegment
  const lowerPoint = new Vector2(curveSegment.data.x, curveSegment.data.y)
  const upperPoint = new Vector2(
    upper.data.x,
    upper.data.y,
  )
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
