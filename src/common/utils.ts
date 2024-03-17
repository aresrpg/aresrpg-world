import { Vector2 } from 'three'

import { EVoxelType } from './constants'

/**
 * Removing out of range values
 * @param noiseVal
 * @returns noiseVal between 0 and 1
 */
const sanitiseNoise = (noiseVal: number) => {
  let res = noiseVal
  const isValidNoiseRange = !isNaN(noiseVal) && noiseVal >= 0 && noiseVal <= 1
  if (!isValidNoiseRange) {
    res = Math.round(noiseVal)
    // console.warn(`invalid noise value: ${noiseVal} corrected to ${res}`)
  }
  return res
}
/**
 * round val at 2 decimal
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

const getVoxelTypeFromHeight = (height: number) => {
  if (height < 10) return EVoxelType.WATER
  else if (height < 20) return EVoxelType.SAND
  else if (height < 60) return EVoxelType.GRASS
  else if (height < 100) return EVoxelType.ROCK
  return EVoxelType.SNOW
}

export { sanitiseNoise, round2, interpolatePoints, getVoxelTypeFromHeight }
