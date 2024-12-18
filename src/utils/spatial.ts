import { Box2, Vector2, Vector3, } from 'three'

import {
    PatchBoundingPoints,
    SurfaceNeighbour,
    VolumeNeighbour,
} from './types'

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

export const getNeighbours2D = (
    pos: Vector2,
    directNeighboursOnly = false,
): Vector2[] => {
    const neighbours = directNeighboursOnly
        ? directNeighbours2D
        : Object.values(SurfaceNeighbour).filter(v => !isNaN(Number(v)))
    return neighbours.map(type => getAdjacent2dCoords(pos, type as number))
}

export const getNeighbours3D = (
    pos: Vector3,
    directNeighboursOnly = false,
): Vector3[] => {
    const neighbours = directNeighboursOnly
        ? directNeighbours3D
        : Object.values(VolumeNeighbour).filter(v => !isNaN(Number(v)))
    return neighbours.map(type => getAdjacent3dCoords(pos, type as number))
}


export const getPatchBoundingPoints = (bounds: Box2) => {
    const { min: xMyM, max: xPyP } = bounds
    const xMyP = xMyM.clone()
    xMyP.y = xPyP.y
    const xPyM = xMyM.clone()
    xPyM.x = xPyP.x
    const points: PatchBoundingPoints = { xMyM, xMyP, xPyM, xPyP }
    return points
}