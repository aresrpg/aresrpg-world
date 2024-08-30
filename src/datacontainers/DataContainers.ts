/**
 * Generic patch data container
 */

import { Vector2, Box2, Vector3 } from 'three'

import { patchLowerId, patchUpperId } from '../common/utils'

// GenericPatch
export interface GenericPatch {
  key: any
  bbox: any
  chunkIds: any
  duplicate(): GenericPatch
  toChunks(): any
  // toLocalPos<T = Vector2 | Vector3>(pos: T): T
  // toGlobalPos<T = Vector2 | Vector3>(pos: T): T
  toLocalPos(pos: Vector3): Vector3
  toGlobalPos(pos: Vector3): Vector3
  containsPoint(pos: Vector3): Boolean
}

/**
 * Generic PatchesMap
 */
export class GenericPatchesMap {
  patchDimensions: Vector2
  constructor(patchDim: Vector2) {
    this.patchDimensions = patchDim
  }

  getPatchRange(bbox: Box2) {
    const rangeMin = patchLowerId(bbox.min, this.patchDimensions)
    const rangeMax = patchUpperId(bbox.max, this.patchDimensions)
    const patchRange = new Box2(rangeMin, rangeMax)
    return patchRange
  }

  getRoundedBox(bbox: Box2) {
    const { min, max } = this.getPatchRange(bbox)
    min.multiply(this.patchDimensions)
    max.multiply(this.patchDimensions)
    const extBbox = new Box2(min, max)
    return extBbox
  }
}
