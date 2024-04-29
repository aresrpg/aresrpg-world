import { Vector2 } from 'three'

import * as Utils from '../common/utils'
import { LinkedList } from '../common/misc'

export type CurveRawParams = {
  x: number
  y: number
}

export class CurveParams {
  onChange
  abscissa: number
  ordinate: number

  constructor(rawParams: CurveRawParams, onChange?: any) {
    this.abscissa = rawParams.x
    this.ordinate = rawParams.y
    this.onChange = onChange
  }

  get absc() {
    return Utils.rnd_dec(this.abscissa, 3)
  }

  set absc(val) {
    this.abscissa = Utils.rnd_dec(val, 3)
    this.onChange?.('CurveParams:absc')
  }

  get ord() {
    return Utils.rnd_dec(this.ordinate, 3)
  }

  set ord(val) {
    this.ordinate = Utils.rnd_dec(val, 3)
    this.onChange?.('CurveParams:ord')
  }
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

  getLower(inputVal: number) {
    return this.getCurveSegment(inputVal).data.ord
  }

  static fromArray(
    rawParams: CurveRawParams[],
    onChange?: any,
  ): HeightProfiler {
    const curveParams = rawParams.map(param => new CurveParams(param, onChange))
    const linkedCurveParams = LinkedList.fromArraWithSorting<CurveParams>(
      curveParams,
      (a, b) => a.absc - b.absc,
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
  while (curveSegment.next && curveSegment.next.data.absc < noise) {
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
  const lowerPoint = new Vector2(curveSegment.data.absc, curveSegment.data.ord)
  const upperPoint = new Vector2(upper.data.absc, upper.data.ord)
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

export const CurvePresets: any = {
  identity: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 1,
      y: 1,
    },
  ],
  regular: [
    {
      x: 0,
      y: 0,
    },
    {
      x: 1,
      y: 255,
    },
  ],
  step2: (x1 = 0.33, x2 = 0.66) => [
    {
      x: 0,
      y: 0,
    },
    {
      x: x1,
      y: 0,
    },
    {
      x: x1,
      y: 0.5,
    },
    {
      x: x2,
      y: 0.5,
    },
    {
      x: x2,
      y: 1,
    },
    {
      x: 1,
      y: 1,
    },
  ],
  step3: [
    {
      x: 0,
      y: 0,
    },

    {
      x: 0.25,
      y: 0,
    },
    {
      x: 0.25,
      y: 0.33,
    },
    {
      x: 0.5,
      y: 0.33,
    },
    {
      x: 0.5,
      y: 0.66,
    },
    {
      x: 0.75,
      y: 0.66,
    },
    {
      x: 0.75,
      y: 1,
    },
    {
      x: 1,
      y: 1,
    },
  ],
}

export { HeightProfiler }
