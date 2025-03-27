import { Vector2, Box2, Vector3 } from 'three'

import { PatchKey } from '../utils/common_types.js'
import {
  parsePatchKey,
  asPatchBounds,
  asVect2,
  parseThreeStub,
} from '../utils/patch_chunk.js'

// export class PatchChunkCommon<T> {

// }

export type PatchElement<T> = {
  pos: Vector2
  index: number
  localPos: Vector2
  data: T
}

export type PatchStub = {
  key?: string
  id?: Vector2
  bounds: Box2
  margin?: number
}

/**
 * Generic patch struct
 */
export class PatchBase<T> {
  bounds = new Box2()
  dimensions = new Vector2()
  margin = 0
  key = '' // needed for patch export
  id: Vector2 | undefined

  constructor(bounds = new Box2(), margin = 0) {
    //, bitLength = BitLength.Uint16) {
    this.init(bounds.clone())
    this.margin = margin
    // this.rawData = getArrayConstructor(bitLength)
  }

  get patchId() {
    return this.id
  }

  get patchKey() {
    return this.key
  }

  set patchKey(patchKey: string) {
    this.key = patchKey
    this.id = parsePatchKey(patchKey)
  }

  get localBox() {
    const localBox = new Box2(new Vector2(0), this.dimensions.clone())
    return localBox
  }

  init(bounds: Box2) {
    this.bounds = bounds
    this.dimensions = bounds.getSize(new Vector2())
  }

  get extendedBounds() {
    return this.bounds.clone().expandByScalar(this.margin)
  }

  get extendedDims() {
    return this.extendedBounds.getSize(new Vector2())
  }

  get localExtendedBox() {
    return this.localBox.expandByScalar(this.margin)
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

  getIndex(localPos: Vector2 | Vector3) {
    localPos = localPos instanceof Vector2 ? localPos : asVect2(localPos)
    return (
      (localPos.y + this.margin) * this.extendedDims.x +
      localPos.x +
      this.margin
    )
  }

  getLocalPosFromIndex(index: number): Vector2 {
    const y = Math.floor(index / this.extendedDims.y) - this.margin
    const x = (index % this.extendedDims.x) - this.margin
    return new Vector2(x, y)
  }

  toLocalPos(globalPos: Vector2) {
    const origin = this.bounds.min.clone()
    return globalPos.clone().sub(origin)
  }

  toWorldPos(localPos: Vector2) {
    const origin = this.bounds.min.clone()
    return origin.add(localPos)
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

  /**
   * by default will iterrate whole patch excluding margins
   * @param globalBounds
   * @param includeMargins
   */
  *iterDataQuery(globalBounds?: Box2, includeMargins = false) {
    const wholeBounds = includeMargins ? this.extendedBounds : this.bounds

    const getOverlapBounds = (inputBounds: Box2) => {
      const { min, max } = inputBounds
      const overlapBounds = new Box2(min.clone().floor(), max.clone().floor())
      return overlapBounds.intersect(wholeBounds)
    }

    const overlapBounds = globalBounds
      ? getOverlapBounds(globalBounds)
      : wholeBounds

    const globalMin = overlapBounds.min
    const globalMax = overlapBounds.max
    const localMin = this.toLocalPos(globalMin)
    // const localMax = this.toLocalPos(globalMax)

    for (
      let yGlobal = globalMin.y, yLocal = localMin.y;
      yGlobal < globalMax.y;
      yGlobal++, yLocal++
    ) {
      for (
        let xGlobal = globalMin.x, xLocal = localMin.x;
        xGlobal < globalMax.x;
        xGlobal++, xLocal++
      ) {
        const localPos = new Vector2(xLocal, yLocal)
        const globalPos = new Vector2(xGlobal, yGlobal)
        const index = this.getIndex(localPos)
        const patchElem: PatchElement<T | undefined> = {
          index,
          pos: globalPos,
          localPos,
          data: undefined,
        }
        yield patchElem
      }
    }
  }

  toStub() {
    const { bounds, margin } = this
    const patchStub: PatchStub = {
      bounds,
      margin,
    }
    if (this.patchKey && this.patchKey !== '') patchStub.key = this.patchKey
    return patchStub
  }

  fromStub(patchStub: PatchStub) {
    this.init(parseThreeStub(patchStub.bounds) as Box2)
    this.id = patchStub.key ? parsePatchKey(patchStub.key) : this.id
    return this
  }

  fromKey(patchKey: PatchKey, patchDim: Vector2, patchMargin = 0) {
    const bounds = asPatchBounds(patchKey, patchDim)
    this.init(bounds)
    this.margin = patchMargin
    this.key = patchKey
    this.id = parsePatchKey(patchKey)
    return this
  }

  // abstract get chunkIds(): ChunkId[]
  // abstract toChunks(): any
}

// export type DataContainer = PatchBase & {
//   rawData: Uint8Array | Uint16Array | Uint32Array
// }

export interface DataContainer {
  rawData: Uint8Array | Uint16Array | Uint32Array
}

export type PatchDataContainer = PatchBase<number> & DataContainer
