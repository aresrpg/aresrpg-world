import { Box3, Vector2, Vector3 } from 'three'

import { PatchCache } from './PatchCache'

/**
 * Local minimal copy of PatchCache
 */
export class LocalCache {
  // eslint-disable-next-line no-use-before-define
  static patchCache: LocalCache[] = []
  static bbox = new Box3()
  static cacheSize = PatchCache.patchSize * 5
  static patchCacheProvider: any
  blocksCache: Uint16Array = new Uint16Array(Math.pow(PatchCache.patchSize, 2))
  bbox: Box3
  dimensions = new Vector3()
  constructor(patchOrigin: Vector2) {
    const { patchSize } = PatchCache
    const bmin = new Vector3(patchOrigin.x, 0, patchOrigin.y)
    const bmax = new Vector3(
      patchOrigin.x + patchSize,
      255,
      patchOrigin.y + patchSize,
    )
    this.bbox = new Box3(bmin, bmax)
    this.bbox.getSize(this.dimensions)
  }

  getBlockLevel(localPos: Vector3) {
    const blockIndex = localPos.x * this.dimensions.x + localPos.z
    const blockLevel = this.blocksCache[blockIndex] || 0
    return blockLevel
  }

  static getPatch(inputPoint: Vector2 | Vector3) {
    const point = new Vector3(
      inputPoint.x,
      0,
      inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    )

    const res = LocalCache.patchCache.find(
      patch =>
        point.x >= patch.bbox.min.x &&
        point.z >= patch.bbox.min.z &&
        point.x < patch.bbox.max.x &&
        point.z < patch.bbox.max.z,
    )
    return res
  }

  static getBlockLevel(globalPos: Vector3) {
    let blockLevel = 0
    const patch = LocalCache.getPatch(globalPos)
    if (patch) {
      const localPos = globalPos.clone().sub(patch.bbox.min)
      blockLevel = patch.getBlockLevel(localPos)
    }
    return blockLevel
  }

  static updateCache(center: Vector3) {
    const { patchSize } = PatchCache
    const bbox = new Box3().setFromCenterAndSize(
      center,
      new Vector3(LocalCache.cacheSize, 0, LocalCache.cacheSize),
    )
    bbox.min.x = bbox.min.x - (bbox.min.x % patchSize)
    bbox.min.z = bbox.min.z - (bbox.min.z % patchSize)
    bbox.max.x = bbox.max.x - (bbox.max.x % patchSize) + patchSize
    bbox.max.z = bbox.max.z - (bbox.max.z % patchSize) + patchSize
    bbox.min.x -= bbox.min.x < 0 ? patchSize : 0
    bbox.min.z -= bbox.min.z < 0 ? patchSize : 0
    bbox.min.y = 0
    bbox.max.y = 0

    const prevCenter = this.bbox.getCenter(new Vector3())
    prevCenter.y = 0
    // const nextCenter = bbox.getCenter(new Vector3())
    // if (nextCenter.distanceTo(prevCenter) > patchSize) {
    LocalCache.bbox = bbox
    const batch: LocalCache[] = []
    const existing: LocalCache[] = []
    for (let xmin = bbox.min.x; xmin < bbox.max.x; xmin += patchSize) {
      for (let zmin = bbox.min.z; zmin < bbox.max.z; zmin += patchSize) {
        const patchStart = new Vector2(xmin, zmin)
        // look for existing patch in current cache
        let patch = LocalCache.getPatch(patchStart) // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
        if (!patch) {
          patch = new LocalCache(patchStart)
          batch.push(patch)
        } else {
          existing.push(patch)
        }
      }
    }
    LocalCache.patchCache = [...existing, ...batch]
    LocalCache.fill(batch)
    // }
  }

  /**
   * Query patch cache provider to fill local blocks data
   */
  static async fill(batch: LocalCache[]) {
    for (const patch of batch) {
      const res = await LocalCache.patchCacheProvider(patch.bbox)
      patch.blocksCache = res.data
    }
  }
}
