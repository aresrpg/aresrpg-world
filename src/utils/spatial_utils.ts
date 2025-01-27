import { Box2, Vector2, Vector3 } from 'three'
import {
  PatchSides, PatchSideId, PatchOffsetId,
  CubeSide, CubeOffsetId,
  PatchBoundingPoints,
  CubeSides,
} from './common_types'

const patchSidesMapping: Record<PatchSideId, PatchOffsetId> = {
  [PatchSideId.LEFT_EDGE]: PatchOffsetId.XmY0,
  [PatchSideId.RIGHT_EDGE]: PatchOffsetId.XpY0,
  [PatchSideId.BOTTOM_EDGE]: PatchOffsetId.X0Ym,
  [PatchSideId.TOP_EDGE]: PatchOffsetId.X0Yp,
  [PatchSideId.BOTTOM_LEFT_CORNER]: PatchOffsetId.XmYm,
  [PatchSideId.BOTTOM_RIGHT_CORNER]: PatchOffsetId.XpYm,
  [PatchSideId.TOP_LEFT_CORNER]: PatchOffsetId.XmYp,
  [PatchSideId.TOP_RIGHT_CORNER]: PatchOffsetId.XpYp,
}

const patchOffsetsMapping: Record<PatchOffsetId, Vector2> = {
  [PatchOffsetId.XmY0]: new Vector2(-1, 0),
  [PatchOffsetId.XpY0]: new Vector2(1, 0),
  [PatchOffsetId.X0Ym]: new Vector2(0, -1),
  [PatchOffsetId.X0Yp]: new Vector2(0, 1),
  [PatchOffsetId.XmYm]: new Vector2(-1, -1),
  [PatchOffsetId.XpYm]: new Vector2(1, -1),
  [PatchOffsetId.XmYp]: new Vector2(-1, 1),
  [PatchOffsetId.XpYp]: new Vector2(1, 1)
}

const patchEdges = () => [PatchSideId.LEFT_EDGE, PatchSideId.RIGHT_EDGE, PatchSideId.BOTTOM_EDGE, PatchSideId.TOP_EDGE]
const patchCorners = () => [PatchSideId.BOTTOM_LEFT_CORNER, PatchSideId.BOTTOM_RIGHT_CORNER, PatchSideId.TOP_LEFT_CORNER, PatchSideId.TOP_RIGHT_CORNER]

const getPatchSides = (patchSides = PatchSides.ALL) => {
  switch (patchSides) {
    case PatchSides.EDGES:
      return patchEdges()
    case PatchSides.CORNERS:
      return patchCorners()
    case PatchSides.ALL:
      return [...patchEdges(), ...patchCorners()]
  }
}

const getPatchSidesOffsetIds = (patchSides = PatchSides.ALL) => getPatchSides(patchSides).map(patchSideId => patchSidesMapping[patchSideId])

export const getPatchNeighbours = (
  pos: Vector2,
  patchSides = PatchSides.ALL,
): Vector2[] => {
  const offsetIds = getPatchSidesOffsetIds(patchSides)
  const neighboursOffsets = offsetIds.map(offsetId => patchOffsetsMapping[offsetId])
  return neighboursOffsets.map(offset => pos.clone().add(offset))
}

// rename as getPatchCorners?
export const getPatchBoundingPoints = (bounds: Box2) => {
  const { min: xMyM, max: xPyP } = bounds
  const xMyP = xMyM.clone()
  xMyP.y = xPyP.y
  const xPyM = xMyM.clone()
  xPyM.x = xPyP.x
  const points: PatchBoundingPoints = { xMyM, xMyP, xPyM, xPyP }
  return points
}

const CubeFaces = [
  CubeSide.FACE_LEFT, CubeSide.FACE_RIGHT,
  CubeSide.FACE_BACK, CubeSide.FACE_FRONT,
  CubeSide.FACE_DOWN, CubeSide.FACE_UP
]

const CubeEdges = [
  CubeSide.EDGE_LEFT_DOWN,
  CubeSide.EDGE_LEFT_UP,
  CubeSide.EDGE_LEFT_BACK,
  CubeSide.EDGE_LEFT_FRONT,
  CubeSide.EDGE_RIGHT_DOWN,
  CubeSide.EDGE_RIGHT_UP,
  CubeSide.EDGE_RIGHT_BACK,
  CubeSide.EDGE_RIGHT_FRONT,
  CubeSide.EDGE_DOWN_BACK,
  CubeSide.EDGE_DOWN_FRONT,
  CubeSide.EDGE_UP_BACK,
  CubeSide.EDGE_UP_FRONT,
]

const CubeCorners = [
  CubeSide.CORNER_LEFT_DOWN_BACK,
  CubeSide.CORNER_LEFT_DOWN_FRONT,
  CubeSide.CORNER_LEFT_UP_BACK,
  CubeSide.CORNER_LEFT_UP_FRONT,
  CubeSide.CORNER_RIGHT_DOWN_BACK,
  CubeSide.CORNER_RIGHT_DOWN_FRONT,
  CubeSide.CORNER_RIGHT_UP_BACK,
  CubeSide.CORNER_RIGHT_UP_FRONT,
]

// const CubeSides = [...CubeFaces, ...CubeEdges, ...CubeCorners]

const cubeSidesMapping: Record<CubeSide, CubeOffsetId> = {
  [CubeSide.FACE_LEFT]: CubeOffsetId.xMy0z0,
  [CubeSide.FACE_RIGHT]: CubeOffsetId.xPy0z0,
  [CubeSide.FACE_DOWN]: CubeOffsetId.x0yMz0,
  [CubeSide.FACE_UP]: CubeOffsetId.x0yPz0,
  [CubeSide.FACE_BACK]: CubeOffsetId.x0y0zM,
  [CubeSide.FACE_FRONT]: CubeOffsetId.x0y0zP,
  [CubeSide.EDGE_LEFT_DOWN]: CubeOffsetId.xMyMz0,
  [CubeSide.EDGE_LEFT_UP]: CubeOffsetId.xMyPz0,
  [CubeSide.EDGE_LEFT_BACK]: CubeOffsetId.xMyMzM,
  [CubeSide.EDGE_LEFT_FRONT]: CubeOffsetId.xMyMzP,
  [CubeSide.EDGE_RIGHT_DOWN]: CubeOffsetId.xPyMz0,
  [CubeSide.EDGE_RIGHT_UP]: CubeOffsetId.xPyPz0,
  [CubeSide.EDGE_RIGHT_BACK]: CubeOffsetId.xPyMzM,
  [CubeSide.EDGE_RIGHT_FRONT]: CubeOffsetId.xPyMzP,
  [CubeSide.EDGE_DOWN_BACK]: CubeOffsetId.x0yMzM,
  [CubeSide.EDGE_DOWN_FRONT]: CubeOffsetId.x0yMzP,
  [CubeSide.EDGE_UP_BACK]: CubeOffsetId.x0yPzM,
  [CubeSide.EDGE_UP_FRONT]: CubeOffsetId.x0yPzP,
  [CubeSide.CORNER_LEFT_DOWN_BACK]: CubeOffsetId.xMyMzM,
  [CubeSide.CORNER_LEFT_DOWN_FRONT]: CubeOffsetId.xMyMzP,
  [CubeSide.CORNER_LEFT_UP_BACK]: CubeOffsetId.xMyPzM,
  [CubeSide.CORNER_LEFT_UP_FRONT]: CubeOffsetId.xMyPzP,
  [CubeSide.CORNER_RIGHT_DOWN_BACK]: CubeOffsetId.xPyMzM,
  [CubeSide.CORNER_RIGHT_DOWN_FRONT]: CubeOffsetId.xPyMzP,
  [CubeSide.CORNER_RIGHT_UP_BACK]: CubeOffsetId.xPyPzM,
  [CubeSide.CORNER_RIGHT_UP_FRONT]: CubeOffsetId.xPyPzP
}

const CubeOffsetsMapping: Record<CubeOffsetId, Vector3> = {
  [CubeOffsetId.xMyMzM]: new Vector3(-1, -1, -1),
  [CubeOffsetId.xMyMz0]: new Vector3(-1, -1, 0),
  [CubeOffsetId.xMyMzP]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMy0zM]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMy0z0]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMy0zP]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMyPzM]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMyPz0]: new Vector3(-1, 0, 0),
  [CubeOffsetId.xMyPzP]: new Vector3(-1, 0, 0),
  [CubeOffsetId.x0yMzM]: new Vector3(0, -1, -1),
  [CubeOffsetId.x0yMz0]: new Vector3(0, -1, 0),
  [CubeOffsetId.x0yMzP]: new Vector3(0, -1, 1),
  [CubeOffsetId.x0y0zM]: new Vector3(0, 0, -1),
  [CubeOffsetId.x0y0zP]: new Vector3(0, 0, 1),
  [CubeOffsetId.x0yPzM]: new Vector3(0, 1, -1),
  [CubeOffsetId.x0yPz0]: new Vector3(0, 1, 0),
  [CubeOffsetId.x0yPzP]: new Vector3(0, 1, 1),
  [CubeOffsetId.xPyMzM]: new Vector3(1, -1, -1),
  [CubeOffsetId.xPyMz0]: new Vector3(1, -1, 0),
  [CubeOffsetId.xPyMzP]: new Vector3(1, -1, 1),
  [CubeOffsetId.xPy0zM]: new Vector3(1, 0, -1),
  [CubeOffsetId.xPy0z0]: new Vector3(1, 0, 0),
  [CubeOffsetId.xPy0zP]: new Vector3(1, 0, 1),
  [CubeOffsetId.xPyPzM]: new Vector3(1, 1, -1),
  [CubeOffsetId.xPyPz0]: new Vector3(1, 1, 0),
  [CubeOffsetId.xPyPzP]: new Vector3(1, 1, 1)
}

const getCubeSides = (cubeSides = CubeSides.ALL) => {
  switch (cubeSides) {
    case CubeSides.FACES:
      return CubeEdges
    case CubeSides.EDGES:
      return CubeEdges
    case CubeSides.CORNERS:
      return CubeCorners
    case CubeSides.ALL:
      return [...CubeFaces, ...CubeEdges, ...CubeCorners]
  }
}

const getCubeOffsetIds = (cubeSides = CubeSides.ALL) => getCubeSides(cubeSides).map(cubeSideId => cubeSidesMapping[cubeSideId])


export const getCubeNeighbours = (
  pos: Vector3,
  cubeSides = CubeSides.ALL
) => {
  const cubeOffsetIds = getCubeOffsetIds(cubeSides)
  const neighboursOffsets = cubeOffsetIds.map(offsetId => CubeOffsetsMapping[offsetId])
  return neighboursOffsets.map(offset => pos.clone().add(offset))
}

