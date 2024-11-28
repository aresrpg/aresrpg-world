import { Vector2, Box2 } from 'three'

import { PatchKey } from '../utils/types'
import {
  parsePatchKey,
  patchBoxFromKey,
  serializePatchId,
} from '../utils/common'
import { WorldEnv } from '../index'

// export class PatchChunkCommon<T> {

// }

/**
 * Generic patch struct
 */
export class PatchBase {
  bounds: Box2
  dimensions: Vector2
  margin = 0
  key = '' // needed for patch export
  patchId: Vector2 | undefined

  constructor(boundsOrPatchKey: Box2 | PatchKey = new Box2(), margin = 0) {
    //, bitLength = BitLength.Uint16) {
    const bounds =
      boundsOrPatchKey instanceof Box2
        ? boundsOrPatchKey.clone()
        : patchBoxFromKey(boundsOrPatchKey, WorldEnv.current.patchDimensions)
    this.bounds = bounds
    this.dimensions = bounds.getSize(new Vector2())
    this.margin = margin
    const patchId =
      typeof boundsOrPatchKey === 'string'
        ? parsePatchKey(boundsOrPatchKey)
        : null
    if (patchId) {
      this.id = patchId
    }
    // this.rawData = getArrayConstructor(bitLength)
  }

  get id() {
    return this.patchId
  }

  set id(patchId: Vector2 | undefined) {
    this.patchId = patchId
    this.key = serializePatchId(patchId)
  }

  get localBox() {
    const localBox = new Box2(new Vector2(0), this.dimensions.clone())
    return localBox
  }

  init(bounds: Box2) {
    this.bounds = bounds
    this.dimensions = bounds.getSize(new Vector2())
  }

  inLocalRange(localPos: Vector2) {
    return (
      localPos.x >= 0 &&
      localPos.x < this.dimensions.x &&
      localPos.y >= 0 &&
      localPos.y < this.dimensions.y
    )
  }

  inWorldRange(globalPos: Vector2) {
    return (
      globalPos.x >= this.bounds.min.x &&
      globalPos.x < this.bounds.max.x &&
      globalPos.y >= this.bounds.min.y &&
      globalPos.y < this.bounds.max.y
    )
  }

  // getIndex(localPos: Vector2) {
  //   return localPos.y * this.dimensions.x + localPos.x
  // }

  // getLocalPosFromIndex(index: number) {
  //   const y = Math.floor(index / this.dimensions.y)
  //   const x = index % this.dimensions.x
  //   return new Vector2(x, y)
  // }

  // toLocalPos<T = Vector2 | Vector3>(pos: T): T
  // toGlobalPos<T = Vector2 | Vector3>(pos: T): T

  toLocalPos(pos: Vector2) {
    const origin = this.bounds.min.clone()
    return pos.clone().sub(origin)
  }

  toWorldPos(pos: Vector2) {
    const origin = this.bounds.min.clone()
    return origin.add(pos)
  }

  isOverlapping(bounds: Box2) {
    const nonOverlapping =
      this.bounds.max.x <= bounds.min.x ||
      this.bounds.min.x >= bounds.max.x ||
      this.bounds.max.y <= bounds.min.y ||
      this.bounds.min.y >= bounds.max.y
    return !nonOverlapping
  }

  containsPoint(pos: Vector2) {
    // return this.bounds.containsPoint(pos)
    return (
      pos.x >= this.bounds.min.x &&
      pos.y >= this.bounds.min.y &&
      pos.x < this.bounds.max.x &&
      pos.y < this.bounds.max.y
    )
  }

  // abstract get chunkIds(): ChunkId[]
  // abstract toChunks(): any
}
