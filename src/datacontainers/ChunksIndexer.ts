import { Box2, Vector2 } from 'three'

import { WorldUtils } from '../index'
import { WorldEnv } from '../config/WorldEnv'
import { asPatchBounds } from '../utils/convert'
import { PatchKey } from '../utils/types'
// import { GroundSurfaceChunkset, UndegroundChunkset } from '../processing/ChunksProcessing'

export class PatchIndexer<T = void> {
  patchLookup: Record<PatchKey, T> = {}

  get indexedKeys() {
    return Object.keys(this.patchLookup)
  }

  get indexedElements() {
    return Object.values(this.patchLookup)
  }

  // sortKeysAroundPos(patchKeys: PatchKey[], pos: Vector2) {
  //     const sortedKeys = patchKeys.map(patchKey => new PatchBase(patchKey))
  //         .sort((p1, p2) => {
  //             // const b1 = asPatchBounds(k1, patchDims)
  //             // const b2 = asPatchBounds(k2, patchDims)
  //             const c1 = p1.bounds.getCenter(new Vector2());
  //             const c2 = p2.bounds.getCenter(new Vector2())
  //             const d1 = c1.distanceTo(pos)
  //             const d2 = c2.distanceTo(pos)
  //             return d1 - d2
  //         })
  //         .map(p => p.key)
  //     return sortedKeys
  // }

  genPatchKeysAroundPos(pos: Vector2, rad: number) {
    const center = pos.clone().floor()
    const dims = new Vector2(rad, rad).multiplyScalar(2)
    // const sphere = new Sphere(center, rad)
    const bounds = new Box2().setFromCenterAndSize(center, dims)
    const patchKeys = WorldUtils.convert
      .getPatchIds(bounds, WorldEnv.current.patchDimensions)
      .sort((v1, v2) => v1.distanceTo(pos) - v2.distanceTo(pos))
      .map(patchId => WorldUtils.convert.serializePatchId(patchId))
    return patchKeys
  }

  // index patch & chunk keys found within radius around pos
  getIndexingChanges(pos: Vector2, rad: number) {
    const patchKeys = this.genPatchKeysAroundPos(pos, rad)
    const newKeys = patchKeys.filter(patchKey => !this.patchLookup[patchKey])
    newKeys.sort((k1, k2) => {
      const b1 = asPatchBounds(k1, WorldEnv.current.patchDimensions)
      const b2 = asPatchBounds(k2, WorldEnv.current.patchDimensions)
      const c1 = b1.getCenter(new Vector2())
      const c2 = b2.getCenter(new Vector2())
      return c1.distanceTo(pos) - c2.distanceTo(pos)
    })
    // clear previous index and override with new patch/chunk keys
    const patchLookup: Record<PatchKey, T> = {}
    for (const patchKey of patchKeys) {
      const existing = this.patchLookup[patchKey]
      if (existing) patchLookup[patchKey] = existing
    }
    this.patchLookup = patchLookup
    return newKeys
  }
}
