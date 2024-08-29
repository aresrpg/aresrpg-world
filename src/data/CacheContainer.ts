import { Box3, Vector3 } from 'three'

import { PatchKey } from '../common/types'
import { WorldConfig } from '../config/WorldConfig'
import { WorldComputeApi } from '../index'

import { BlocksPatch, PatchMap } from './BlocksContainers'

/**
 * Blocks cache
 */
export class CacheContainer extends PatchMap {
  // eslint-disable-next-line no-use-before-define
  static singleton: CacheContainer
  pendingRefresh = false
  builtInCache = false // specify whether cache is managed internally or separately
  static cachePowRadius = 2
  static cacheSize = WorldConfig.patchSize * 5

  static get instance() {
    this.singleton = this.singleton || new CacheContainer()
    return this.singleton
  }

  async populate(batch: PatchKey[]) {
    this.pendingRefresh = true
    const batchIter = WorldComputeApi.instance.iterPatchCompute(batch)
    // populate cache without blocking execution
    for await (const patch of batchIter) {
      this.patchLookup[patch.key] = patch
      this.bbox.union(patch.bbox)
    }
    this.pendingRefresh = false
  }

  /**
   *
   * @param center
   * @param dryRun
   * @returns true if cache was update, false otherwise
   */
  async refresh(bbox: Box3) {
    //, patchMask = () => true) {
    let changesDiff
    if (!this.pendingRefresh) {
      const emptyContainer = new PatchMap()
      emptyContainer.initFromBoxAndMask(bbox)
      changesDiff = emptyContainer.compareWith(CacheContainer.instance)
      const hasChanged = Object.keys(changesDiff).length > 0

      // (!cacheCenter.equals(this.cacheCenter) || cachePatchCount === 0)
      if (hasChanged) {
        // backup patches that will remain in cache
        const backup = this.availablePatches.filter(patch => patch)
        // reinit cache
        super.initFromBoxAndMask(bbox)
        // restore remaining patches backup
        this.populateFromExisting(backup)
        this.builtInCache && (await this.populate(this.missingPatchKeys))
      }
    }
    // return patch keys changes
    return changesDiff
  }

  getPatches(inputBbox: Box3) {
    const bbox = inputBbox.clone()
    bbox.min.y = 0
    bbox.max.y = 512
    const res = this.availablePatches.filter(patch =>
      patch.bbox.intersectsBox(bbox),
    )
    return res
  }

  getNearPatches(patch: BlocksPatch) {
    const dim = patch.dimensions
    const patchCenter = patch.bbox.getCenter(new Vector3())
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
    const patchNeighbours: BlocksPatch[] = neighboursCenters
      .map(patchCenter => this.findPatch(patchCenter))
      .filter(patch => patch) as BlocksPatch[]
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
