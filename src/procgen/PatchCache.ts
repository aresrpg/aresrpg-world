import { Box3, Vector2, Vector3 } from 'three'

export class PatchCache {
  // eslint-disable-next-line no-use-before-define
  // static cache: PatchCache[] = []
  static patchSize = Math.pow(2, 6)
  static bbox = new Box3()

  bbox: Box3
  dimensions = new Vector3()

  constructor(patchOrigin: Vector2) {
    const { patchSize } = PatchCache
    const bmin = new Vector3(patchOrigin.x, 0, patchOrigin.y)
    const bmax = new Vector3(
      patchOrigin.x + patchSize,
      512,
      patchOrigin.y + patchSize,
    )
    this.bbox = new Box3(bmin, bmax)
    this.bbox.getSize(this.dimensions)
  }

  static getPatchOrigin(input: Box3 | Vector3 | Vector2) {
    const { patchSize } = this
    const inputCopy: Vector3 | Box3 =
      input instanceof Vector2
        ? new Vector3(input.x, 0, input.y)
        : input.clone()
    const point =
      inputCopy instanceof Box3
        ? (inputCopy as Box3).getCenter(new Vector3())
        : (inputCopy as Vector3).clone()
    let minx = point.x - (point.x % patchSize)
    minx -= point.x < 0 && point.x % this.patchSize !== 0 ? patchSize : 0
    let minz = point.z - (point.z % patchSize)
    minz -= point.z < 0 && point.z % this.patchSize !== 0 ? patchSize : 0
    const patchOrigin = new Vector2(minx, minz)
    return patchOrigin
  }

  static getPatches(inputBbox: Box3, patchCache: PatchCache[]) {
    const bbox = inputBbox.clone()
    bbox.min.y = 0
    bbox.max.y = 512
    const res = patchCache.filter(patch => patch.bbox.intersectsBox(bbox))
    return res
  }

  static getPatch(inputPoint: Vector2 | Vector3, patchCache: PatchCache[]) {
    const point = new Vector3(
      inputPoint.x,
      0,
      inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    )

    const res = patchCache.find(
      patch =>
        point.x >= patch.bbox.min.x &&
        point.z >= patch.bbox.min.z &&
        point.x < patch.bbox.max.x &&
        point.z < patch.bbox.max.z,
    )
    return res
  }

  getPatchCoords() {}

  getNearPatches(patchCache: PatchCache[]) {
    const dim = this.dimensions
    const patchCenter = this.bbox.getCenter(new Vector3())
    const minX = patchCenter.clone().add(new Vector3(-dim.x, 0, 0))
    const maxX = patchCenter.clone().add(new Vector3(dim.x, 0, 0))
    const minZ = patchCenter.clone().add(new Vector3(0, 0, -dim.z))
    const maxZ = patchCenter.clone().add(new Vector3(0, 0, dim.z))
    const minXminZ = patchCenter.clone().add(new Vector3(-dim.x, 0, -dim.z))
    const minXmaxZ = patchCenter.clone().add(new Vector3(-dim.x, 0, dim.z))
    const maxXminZ = patchCenter.clone().add(new Vector3(dim.x, 0, -dim.z))
    const maxXmaxZ = patchCenter.clone().add(new Vector3(dim.x, 0, dim.z))
    const neighboursCenters = [
      minX,
      maxX,
      minZ,
      maxZ,
      minXminZ,
      minXmaxZ,
      maxXminZ,
      maxXmaxZ,
    ]
    const patchNeighbours: PatchCache[] = neighboursCenters
      .map(patchCenter => PatchCache.getPatch(patchCenter, patchCache))
      .filter(patch => patch) as PatchCache[]
    return patchNeighbours
  }
}
