import { Vector2, Vector3 } from 'three'
import { AresRpgEngine } from '@aresrpg/aresrpg-engine'

import { EVoxelType } from './constants'
const { ENeighbour } = AresRpgEngine

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
 *
 * @param p1
 * @param p2
 * @param t between P1 and P2
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

/**
 * Get direction from relative coords
 * z- back
 * z+ front
 * x- left
 * x+ right
 * y+ top
 * y- bottom
 * @param x
 * @param y
 * @param z
 * @returns ENeighbour
 */
const getCoordsDirection = (x: number, y: number, z: number) => {
  let dir
  if (x === -1 && y === -1 && z === -1) dir = ENeighbour.xMyMzM
  else if (x === -1 && y === -1 && z === 0) dir = ENeighbour.xMyMz0
  else if (x === -1 && y === -1 && z === 1) dir = ENeighbour.xMyMzP
  else if (x === -1 && y === 0 && z === -1) dir = ENeighbour.xMy0zM
  else if (x === -1 && y === 0 && z === 0) dir = ENeighbour.xMy0z0
  else if (x === -1 && y === 0 && z === 1) dir = ENeighbour.xMy0zP
  else if (x === -1 && y === 1 && z === -1) dir = ENeighbour.xMyPzM
  else if (x === -1 && y === 1 && z === 0) dir = ENeighbour.xMyPz0
  else if (x === -1 && y === 1 && z === 1) dir = ENeighbour.xMyPzP
  else if (x === 0 && y === -1 && z === -1) dir = ENeighbour.x0yMzM
  else if (x === 0 && y === -1 && z === 0) dir = ENeighbour.x0yMz0
  else if (x === 0 && y === -1 && z === 1) dir = ENeighbour.x0yMzP
  else if (x === 0 && y === 0 && z === -1) dir = ENeighbour.x0y0zM
  else if (x === 0 && y === 0 && z === 1) dir = ENeighbour.x0y0zP
  else if (x === 0 && y === 1 && z === -1) dir = ENeighbour.x0yPzM
  else if (x === 0 && y === 1 && z === 0) dir = ENeighbour.x0yPz0
  else if (x === 0 && y === 1 && z === 1) dir = ENeighbour.x0yPzP
  else if (x === 1 && y === -1 && z === -1) dir = ENeighbour.xPyMzM
  else if (x === 1 && y === -1 && z === 0) dir = ENeighbour.xPyMz0
  else if (x === 1 && y === -1 && z === 1) dir = ENeighbour.xPyMzP
  else if (x === 1 && y === 0 && z === -1) dir = ENeighbour.xPy0zM
  else if (x === 1 && y === 0 && z === 0) dir = ENeighbour.xPy0z0
  else if (x === 1 && y === 0 && z === 1) dir = ENeighbour.xPy0zP
  else if (x === 1 && y === 1 && z === -1) dir = ENeighbour.xPyPzM
  else if (x === 1 && y === 1 && z === 0) dir = ENeighbour.xPyPz0
  else if (x === 1 && y === 1 && z === 1) dir = ENeighbour.xPyPzP
  return dir
}

/**
 * 
 * @param pos point position to get neighbours from
 * @param dir neighbour identifier
 * @returns 
 */
const getNeighbour = (pos: Vector3, dir: AresRpgEngine.ENeighbour): (Vector3 | undefined) => {
  switch (dir) {
    case ENeighbour.xMyMzM:
      return pos.clone().add(new Vector3(-1, -1, -1))
    case ENeighbour.xMyMz0:
      return pos.clone().add(new Vector3(-1, -1, 0))
    case ENeighbour.xMyMzP:
      return pos.clone().add(new Vector3(-1, -1, 1))
    case ENeighbour.xMy0zM:
      return pos.clone().add(new Vector3(-1, 0, -1))
    case ENeighbour.xMy0z0:
      return pos.clone().add(new Vector3(-1, 0, 0))
    case ENeighbour.xMy0zP:
      return pos.clone().add(new Vector3(-1, 0, 1))
    case ENeighbour.xMyPzM:
      return pos.clone().add(new Vector3(-1, 1, -1))
    case ENeighbour.xMyPz0:
      return pos.clone().add(new Vector3(-1, 1, 0))
    case ENeighbour.xMyPzP:
      return pos.clone().add(new Vector3(-1, 1, 1))
    case ENeighbour.x0yMzM:
      return pos.clone().add(new Vector3(0, -1, -1))
    case ENeighbour.x0yMz0:
      return pos.clone().add(new Vector3(0, -1, 0))
    case ENeighbour.x0yMzP:
      return pos.clone().add(new Vector3(0, -1, 1))
    case ENeighbour.x0y0zM:
      return pos.clone().add(new Vector3(0, 0, -1))
    case ENeighbour.x0y0zP:
      return pos.clone().add(new Vector3(0, 0, 1))
    case ENeighbour.x0yPzM:
      return pos.clone().add(new Vector3(0, 1, -1))
    case ENeighbour.x0yPz0:
      return pos.clone().add(new Vector3(0, 1, 0))
    case ENeighbour.x0yPzP:
      return pos.clone().add(new Vector3(0, 1, 1))
    case ENeighbour.xPyMzM:
      return pos.clone().add(new Vector3(1, -1, -1))
    case ENeighbour.xPyMz0:
      return pos.clone().add(new Vector3(1, -1, 0))
    case ENeighbour.xPyMzP:
      return pos.clone().add(new Vector3(1, -1, 1))
    case ENeighbour.xPy0zM:
      return pos.clone().add(new Vector3(1, 0, -1))
    case ENeighbour.xPy0z0:
      return pos.clone().add(new Vector3(1, 0, 0))
    case ENeighbour.xPy0zP:
      return pos.clone().add(new Vector3(1, 0, 1))
    case ENeighbour.xPyPzM:
      return pos.clone().add(new Vector3(1, 1, -1))
    case ENeighbour.xPyPz0:
      return pos.clone().add(new Vector3(1, 1, 0))
    case ENeighbour.xPyPzP:
      return pos.clone().add(new Vector3(1, 1, 1))
  }
}

const getAllNeighbours: Vector3[] = (pos: Vector3) => {
  const neighbours = Object.values(AresRpgEngine.ENeighbour)
    .filter((v) => !isNaN(Number(v)))
    .map(type => getNeighbour(pos, (type as number)))
  return neighbours || []
}

export {
  sanitiseNoise,
  interpolatePoints,
  getVoxelTypeFromHeight,
  getCoordsDirection,
  getAllNeighbours,
  getNeighbour
}
