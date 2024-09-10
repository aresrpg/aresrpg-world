import { Vector2, Box2, Vector3 } from 'three'

import { PatchKey } from '../common/types'
import {
  asVect2,
  asVect3,
  getPatchId,
  parsePatchKey,
  patchBoxFromKey,
  patchUpperId,
  serializePatchId,
} from '../common/utils'
import { WorldConf } from '../index'

const getDefaultPatchDim = () =>
  new Vector2(WorldConf.patchSize, WorldConf.patchSize)

/**
 * Multi purpose low level data container
 */
export abstract class DataContainer<T extends Uint16Array | Uint32Array> {
  bounds: Box2
  dimensions: Vector2
  margin = 0
  key = '' // needed for patch export
  patchId: Vector2 | undefined
  abstract rawData: T

  constructor(boundsOrPatchKey: Box2 | PatchKey = new Box2(), margin = 0) {
    //, bitLength = BitLength.Uint16) {
    const bounds =
      boundsOrPatchKey instanceof Box2
        ? boundsOrPatchKey.clone()
        : patchBoxFromKey(boundsOrPatchKey, getDefaultPatchDim())
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

  get extendedBounds() {
    return this.bounds.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBounds.getSize(new Vector2())
  }

  get localBox() {
    const localBox = new Box2(new Vector2(0), this.dimensions.clone())
    return localBox
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
  }

  init(bounds: Box2) {
    this.bounds = bounds
    this.dimensions = bounds.getSize(new Vector2())
  }

  // copy occurs only on the overlapping global pos region of both containers
  static copySourceOverTargetContainer(source: any, target: any) {
    const adjustOverlapMargins = (overlap: Box2) => {
      const margin = Math.min(target.margin, source.margin) || 0
      overlap.min.x -= target.bounds.min.x === overlap.min.x ? margin : 0
      overlap.min.y -= target.bounds.min.y === overlap.min.y ? margin : 0
      overlap.max.x += target.bounds.max.x === overlap.max.x ? margin : 0
      overlap.max.y += target.bounds.max.y === overlap.max.y ? margin : 0
    }

    if (source.bounds.intersectsBox(target.bounds)) {
      const overlap = target.bounds.clone().intersect(source.bounds)
      adjustOverlapMargins(overlap)
      for (let { x } = overlap.min; x < overlap.max.x; x++) {
        // const globalStartPos = new Vector3(x, 0, overlap.min.y)
        const globalStartPos = new Vector2(x, overlap.min.y)
        const targetLocalStartPos = target.toLocalPos(globalStartPos)
        const sourceLocalStartPos = source.toLocalPos(globalStartPos)
        let targetIndex = target.getIndex(targetLocalStartPos)
        let sourceIndex = source.getIndex(sourceLocalStartPos)
        for (let { y } = overlap.min; y < overlap.max.y; y++) {
          const sourceVal = source.rawData[sourceIndex]
          if (sourceVal) {
            target.rawData[targetIndex] = sourceVal
          }
          sourceIndex++
          targetIndex++
        }
      }
    }
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

  getIndex(localPos: Vector2) {
    return localPos.x * this.dimensions.y + localPos.y
  }

  getLocalPosFromIndex(index: number) {
    const y = index % this.dimensions.y
    const x = Math.floor(index / this.dimensions.y)
    return new Vector2(x, y)
  }

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

  containsPoint(pos: Vector2) {
    return this.bounds.containsPoint(pos)
    // return (
    //   blockPos.x >= this.bounds.min.x &&
    //   blockPos.z >= this.bounds.min.z &&
    //   blockPos.x < this.bounds.max.x &&
    //   blockPos.z < this.bounds.max.z
    // )
  }

  // abstract get chunkIds(): ChunkId[]
  // abstract toChunks(): any
}

/**
 * PatchesMap base class
 */
export class PatchesMapBase {
  patchDimensions: Vector2
  constructor(patchDim: Vector2) {
    this.patchDimensions = patchDim
  }

  getPatchRange(bounds: Box2) {
    const rangeMin = getPatchId(bounds.min, this.patchDimensions)
    const rangeMax = patchUpperId(bounds.max, this.patchDimensions) // .addScalar(1)
    const patchRange = new Box2(rangeMin, rangeMax)
    return patchRange
  }

  getPatchIds(bounds: Box2) {
    const patchIds = []
    const patchRange = this.getPatchRange(bounds)
    // iter elements on computed range
    const { min, max } = patchRange
    for (let { x } = min; x <= max.x; x++) {
      for (let { y } = min; y <= max.y; y++) {
        patchIds.push(new Vector2(x, y))
      }
    }
    return patchIds
  }

  getRoundedBox(bbox: Box2) {
    const { min, max } = this.getPatchRange(bbox)
    min.multiply(this.patchDimensions)
    max.multiply(this.patchDimensions)
    const extBbox = new Box2(min, max)
    return extBbox
  }

  /**
   * Merges all patches as single data container
   */
  asMergedContainer() { }
}
