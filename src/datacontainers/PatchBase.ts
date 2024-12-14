import { Vector2, Box2, Vector3 } from 'three'
import { PatchBlock, PatchKey } from '../utils/types'
import { parsePatchKey, asPatchBounds, serializePatchId, asVect2, asVect3, parseThreeStub } from '../utils/common'
import { BlockType, WorldEnv } from '../index'

// export class PatchChunkCommon<T> {

// }

type PatchSectorAddr = {
  pos: Vector2,
  index: number,
  localPos: Vector2
}

export type PatchStub = {
  key?: string
  bounds: Box2
  margin?: number
}

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
        : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
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
          const sectorAddr: PatchSectorAddr = {
            index,
            pos: this.toWorldPos(localPos),
            localPos,
          }
          yield sectorAddr
        }
        index++
      }
    }
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
      for (let { y } = overlap.min; y < overlap.max.y; y++) {
        // const globalStartPos = new Vector3(x, 0, overlap.min.y)
        const globalStartPos = new Vector2(overlap.min.x, y)
        const targetLocalStartPos = target.toLocalPos(globalStartPos)
        const sourceLocalStartPos = source.toLocalPos(globalStartPos)
        let targetIndex = target.getIndex(targetLocalStartPos)
        let sourceIndex = source.getIndex(sourceLocalStartPos)
        for (let { x } = overlap.min; x < overlap.max.x; x++) {
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

  toStub() {
    const { bounds, margin } = this
    const patchStub: PatchStub = {
      bounds,
      margin,
    }
    if (this.key && this.key !== '') patchStub.key = this.key
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
