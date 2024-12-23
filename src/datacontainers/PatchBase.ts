import { Vector2, Box2, Vector3 } from 'three'

import { PatchKey } from '../utils/types'
import {
  parsePatchKey,
  asPatchBounds,
  serializePatchId,
  asVect2,
  parseThreeStub,
} from '../utils/convert'
import { WorldEnv } from '../index'

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
  bounds: Box2
  dimensions: Vector2
  margin = 0
  key = '' // needed for patch export
  id: Vector2 | undefined

  constructor(boundsOrPatchKey: Box2 | PatchKey = new Box2(), margin = 0) {
    //, bitLength = BitLength.Uint16) {
    const bounds =
      boundsOrPatchKey instanceof Box2
        ? boundsOrPatchKey.clone()
        : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
    this.bounds = bounds
    this.dimensions = bounds.getSize(new Vector2())
    this.margin = margin
    if (typeof boundsOrPatchKey === 'string') {
      this.patchKey = boundsOrPatchKey
    }
    // this.rawData = getArrayConstructor(bitLength)
  }

  get patchId(){
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

  adjustInputBounds(input: Box2 | Vector2, local = false) {
    const rangeBox = input instanceof Box2 ? input : new Box2(input, input)
    const { min, max } = local ? this.localBox : this.bounds
    const rangeMin = new Vector2(
      Math.max(Math.floor(rangeBox.min.x), min.x),
      Math.max(Math.floor(rangeBox.min.y), min.y),
    )
    const rangeMax = new Vector2(
      Math.min(Math.floor(rangeBox.max.x), max.x),
      Math.min(Math.floor(rangeBox.max.y), max.y),
    )
    return local
      ? new Box2(rangeMin, rangeMax)
      : new Box2(this.toLocalPos(rangeMin), this.toLocalPos(rangeMax))
  }

  /**
   *
   * @param rangeBox iteration range as global coords
   * @param skipMargin
   */
  *iterDataQuery(iterBounds?: Box2 | Vector2, skipMargin = true) {
    // convert to local coords to speed up iteration
    const localBounds = iterBounds
      ? this.adjustInputBounds(iterBounds)
      : this.localExtendedBox

    const isMarginBlock = ({ x, y }: { x: number; y: number }) =>
      !iterBounds &&
      this.margin > 0 &&
      (x === localBounds.min.x ||
        x === localBounds.max.x - 1 ||
        y === localBounds.min.y ||
        y === localBounds.max.y - 1)

    let index = 0
    for (let { y } = localBounds.min; y < localBounds.max.y; y++) {
      for (let { x } = localBounds.min; x < localBounds.max.x; x++) {
        const localPos = new Vector2(x, y)
        if (!skipMargin || !isMarginBlock(localPos)) {
          index = iterBounds ? this.getIndex(localPos) : index
          // const data = this.readData(index) || BlockType.NONE
          const patchElem: PatchElement<T | undefined> = {
            index,
            pos: this.toWorldPos(localPos),
            localPos,
            data: undefined,
          }
          yield patchElem
        }
        index++
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
