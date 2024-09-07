import { Box2, Vector2, Vector3 } from 'three'

import { PatchKey } from '../common/types'
import { asVect3 } from '../common/utils'
import { GroundPatch, WorldComputeProxy, WorldConf } from '../index'

import { PatchesMap } from './PatchesMap'

const getDefaultPatchDim = () =>
  new Vector2(WorldConf.patchSize, WorldConf.patchSize)

/**
 * Blocks cache
 */
export class CacheContainer extends PatchesMap<GroundPatch> {
  static cachePowRadius = 2
  static cacheSize = WorldConf.patchSize * 5
  // eslint-disable-next-line no-use-before-define
  static singleton: CacheContainer
  pendingRefresh = false
  builtInCache = false // specify whether cache is managed internally or separately

  static get instance() {
    this.singleton = this.singleton || new CacheContainer(getDefaultPatchDim())
    return this.singleton
  }

  async populate(batch: PatchKey[]) {
    this.pendingRefresh = true
    const batchIter = WorldComputeProxy.instance.iterPatchCompute(batch)
    // populate cache without blocking execution
    for await (const patch of batchIter) {
      if (patch.key) {
        this.patchLookup[patch.key] = patch
        this.bbox.union(patch.bounds)
      }
    }
    this.pendingRefresh = false
  }

  /**
   *
   * @param center
   * @param dryRun
   * @returns true if cache was update, false otherwise
   */
  async refresh(bbox: Box2) {
    //, patchMask = () => true) {
    let changesDiff
    if (!this.pendingRefresh) {
      const emptyContainer = new PatchesMap(this.patchDimensions)
      emptyContainer.init(bbox)
      changesDiff = emptyContainer.compareWith(CacheContainer.instance)
      const hasChanged = Object.keys(changesDiff).length > 0

      // (!cacheCenter.equals(this.cacheCenter) || cachePatchCount === 0)
      if (hasChanged) {
        // backup patches that will remain in cache
        const backup = this.availablePatches.filter(patch => patch)
        // reinit cache
        super.init(bbox)
        // restore remaining patches backup
        this.populateFromExisting(backup)
        this.builtInCache && (await this.populate(this.missingPatchKeys))
      }
    }
    // return patch keys changes
    return changesDiff
  }

  getOverlappingPatches(inputBounds: Box2) {
    const overlappingBounds = (bounds1: Box2, bounds2: Box2) =>
      !(
        bounds1.max.x <= bounds2.min.x ||
        bounds1.min.x >= bounds2.max.x ||
        bounds1.max.y <= bounds2.min.y ||
        bounds1.min.y >= bounds2.max.y
      )
    return this.availablePatches.filter(patch =>
      overlappingBounds(patch.bounds, inputBounds),
    )
  }

  getNearPatches(patch: GroundPatch) {
    const dim = patch.dimensions
    const patchCenter = patch.bounds.getCenter(new Vector2())
    const minX = patchCenter.clone().add(new Vector3(-dim.x, 0))
    const maxX = patchCenter.clone().add(new Vector3(dim.x, 0))
    const minZ = patchCenter.clone().add(new Vector3(0, -dim.y))
    const maxZ = patchCenter.clone().add(new Vector3(0, dim.y))
    const minXminZ = patchCenter.clone().add(new Vector3(-dim.x, -dim.y))
    const minXmaxZ = patchCenter.clone().add(new Vector3(-dim.x, dim.y))
    const maxXminZ = patchCenter.clone().add(new Vector3(dim.x, -dim.y))
    const maxXmaxZ = patchCenter.clone().add(new Vector3(dim.x, dim.y))
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
    const patchNeighbours: GroundPatch[] = neighboursCenters
      .map(patchCenter => this.findPatch(asVect3(patchCenter)))
      .filter(patch => patch) as GroundPatch[]
    return patchNeighbours
  }

  // getGroundBlock(globalPos: Vector3) {
  //   const { bbox } = this
  //   let blockRes
  //   globalPos.y = bbox.getCenter(new Vector3()).y
  //   if (bbox.containsPoint(globalPos)) {
  //     const patch = this.findPatch(globalPos)
  //     if (patch) {
  //       const localPos = globalPos.clone().sub(patch.bbox.min)
  //       blockRes = patch.getBlock(localPos) as BlockData
  //     }
  //   } else {
  //     const batchRes = WorldComputeApi.instance.computeBlocksBatch([globalPos])
  //     const blockRes = batchRes instanceof Promise ? batchRes.then(batchRes => batchRes[0]) : batchRes[0]
  //     if (!blockRes) {
  //       console.log(blockRes)
  //     }
  //   }
  //   return blockRes
  // }

  // async getUpperBlock(globalPos: Vector3) {
  //   const block = await this.getGroundBlock(globalPos)
  //   if (block) {
  //     const blocksBuffer = (await WorldApi.instance.call(
  //       WorldApiName.OvergroundBufferCompute,
  //       [block.pos],
  //     )) as BlockType[]
  //     const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
  //     if (lastBlockIndex >= 0) {
  //       block.pos.y += lastBlockIndex
  //       block.type = blocksBuffer[lastBlockIndex] as BlockType
  //     }
  //   }
  //   return block
  // }

  // setBlock(globalPos: Vector3, block: BlockData) {
  //   // find patch containing point in cache
  //   const patch = this.findPatch(globalPos)
  //   if (patch) {
  //     const localPos = globalPos.clone().sub(patch.bbox.min)
  //     patch.setBlock(localPos, block.type)
  //   } else {
  //     console.log(globalPos)
  //   }
  //   return block
  // }
}
