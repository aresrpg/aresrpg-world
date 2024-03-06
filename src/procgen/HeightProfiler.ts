import { Vector2 } from 'three'

import { interpolatePoints } from '../common/utils'

export enum ProfileType {
    Regular = 'regular',
    Continentalness = 'continentalness',
    Erosion = 'erosion',
    PeaksValleys = 'peaksvalleys',
}

/**
 * Shape used to profile terrain height
 * e.g. mapping value to real ground/terrain height
 */
class HeightProfiler {
    static profiles = {}
    curveParams
    constructor(curveParams) {
        this.curveParams = curveParams
    }

    static addProfile(curveProfile, profileType: ProfileType) {
        HeightProfiler.profiles[profileType] =
            HeightProfiler.profiles[profileType] || new HeightProfiler(curveProfile)
    }

    getCurveSegment(inputVal) {
        return getCurveSegment(inputVal, this.curveParams)
    }

    static apply(profileType: ProfileType, inputVal) {
        const profile = HeightProfiler.profiles[profileType]
        return noiseToHeight(inputVal, profile.getCurveSegment(inputVal))
    }
}

/**
 *
 * @param noise input val
 * @param curveProfile curve points array
 * @returns upper and lower points from curve profile closest to input val
 */
const getCurveSegment = (noise, curveProfile) => {
    const lower = curveProfile
        .filter(point => point.noise <= noise)
        .reduce((last, curr) => {
            const currDiff = Math.abs(noise - curr.noise)
            const lastDiff = Math.abs(noise - last.noise)
            return currDiff < lastDiff ? curr : last
        })
    const upper = curveProfile
        .filter(point => point.noise >= noise)
        .reduce((last, curr) => {
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
const noiseToHeight = (noiseVal: number, curveSegment) => {
    const { lower, upper } = curveSegment
    const lowerPoint = new Vector2(lower.noise, lower.height)
    const upperPoint = new Vector2(upper.noise, upper.height)
    const interpolatedHeight = interpolatePoints(lowerPoint, upperPoint, noiseVal)
    return interpolatedHeight
}

/**
 *  Spline curve parameters
 */
const CurvePresets = {
    regular: [
        {
            noise: 0,
            height: 0,
        },
        {
            noise: 1,
            height: 255,
        },
    ],
    continentalness: [
        {
            noise: 0,
            height: 0,
        },
        {
            noise: 0.65,
            height: 150,
        },
        {
            noise: 0.75,
            height: 255,
        },
        {
            noise: 1,
            height: 255,
        },
    ],
    erosion: [
        {
            noise: 0,
            height: 50,
        },
        {
            noise: 0.65,
            height: 100,
        },
        {
            noise: 0.75,
            height: 150,
        },
        {
            noise: 1,
            height: 150,
        },
    ],
    peaksValleys: [
        {
            noise: 0,
            height: 50,
        },
        {
            noise: 0.65,
            height: 100,
        },
        {
            noise: 0.75,
            height: 150,
        },
        {
            noise: 1,
            height: 150,
        },
    ],
}

export { HeightProfiler, CurvePresets }
