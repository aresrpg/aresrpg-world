import { Vector2 } from 'three'

import { interpolatePoints } from '../common/utils'

export enum ProfileType {
  Regular = 'regular',
  Continentalness = 'continentalness',
  Erosion = 'erosion',
  PeaksValleys = 'peaksvalleys',
}

/**
 * Profile used to map scalar field to terrain height
 */
class HeightProfiler {
  static profiles: any = {}
  curveParams
  constructor(curveParams: any) {
    this.curveParams = curveParams
  }

  static addProfile(
    curveProfile: { noise: number; height: number }[],
    profileType: ProfileType,
  ) {
    HeightProfiler.profiles[profileType] =
      HeightProfiler.profiles[profileType] || new HeightProfiler(curveProfile)
  }

  getCurveSegment(inputVal: any) {
    return getCurveSegment(inputVal, this.curveParams)
  }

  apply(inputVal: number) {
    return noiseToHeight(inputVal, this.getCurveSegment(inputVal))
  }

  static apply(profileType: ProfileType, inputVal: number) {
    const profile = HeightProfiler.profiles[profileType]
    return profile.apply(inputVal)
  }
}

/**
 *
 * @param noise input val
 * @param curveProfile curve points array
 * @returns upper and lower points from curve profile closest to input val
 */
const getCurveSegment = (noise: number, curveProfile: any[]) => {
  const lower = curveProfile
    .filter((point: { noise: number }) => point.noise <= noise)
    .reduce((last: { noise: number }, curr: { noise: number }) => {
      const currDiff = Math.abs(noise - curr.noise)
      const lastDiff = Math.abs(noise - last.noise)
      return currDiff < lastDiff ? curr : last
    })
  const upper = curveProfile
    .filter((point: { noise: number }) => point.noise >= noise)
    .reduce((last: { noise: number }, curr: { noise: number }) => {
      const currDiff = Math.abs(noise - curr.noise)
      const lastDiff = Math.abs(noise - last.noise)
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
  const lowerPoint = new Vector2(lower.noise, lower.height)
  const upperPoint = new Vector2(upper.noise, upper.height)
  const interpolatedHeight = interpolatePoints(lowerPoint, upperPoint, noiseVal)
  return interpolatedHeight
}
/**
 * Profile to determine 
 * - used sampled density
 * - curve mapping from sampled value to height
 * - threshold after which next profile is applied
 */
type HeightProfile = {
  shape: [],
  treshold: number,
  density: number
}

/**
 *  Spline curve parameters 
 */
const CurvePresets = {
  identity: [
    {
      noise: 0,
      height: 0
    },
    {
      noise: 1,
      height: 1
    },
  ],
  regular: [
    {
      noise: 0,
      height: 0
    },
    {
      noise: 1,
      height: 255
    },
  ],
  continentalness: [
    {
      noise: 0,
      height: 0
    },
    {
      noise: 0.65,
      height: 150
    },
    {
      noise: 0.75,
      height: 255
    },
    {
      noise: 1,
      height: 255
    },
  ],
  erosion: [
    {
      noise: 0,
      height: 200
    },
    {
      noise: 0.6,
      height: 100
    },
    {
      noise: 0.75,
      height: 50
    },
    {
      noise: 1,
      height: 50
    },
  ],
  peaksValleys: [
    {
      noise: 0,
      height: 50
    },
    {
      noise: 0.65,
      height: 100
    },
    {
      noise: 0.75,
      height: 150
    },
    {
      noise: 1,
      height: 150
    },
  ],
}

export { HeightProfiler, CurvePresets }
