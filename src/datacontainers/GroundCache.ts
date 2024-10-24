/**
 * Allows precaching patches around position, with new patches automatically computed
 * when position is updated
 * Previous patches can be simply removed, or kept until condition is met:
 * cache size exceeds, LRU, ..
 */
import { Box2, Vector2 } from 'three'

import { PatchBlock, PatchKey } from '../common/types'
import { getPatchId, getPatchIds, serializePatchId } from '../common/utils'
import { GroundPatch, PatchContainer, WorldConf } from '../index'

export class PatchesContainer<T extends PatchContainer<any>> {
  patchLookup: Record<PatchKey, T> = {}
  patchDimensions

  constructor() {
    this.patchDimensions = WorldConf.regularPatchDimensions
  }

  get keys() {
    return Object.keys(this.patchLookup)
  }

  get patches() {
    return Object.values(this.patchLookup)
  }

  getOverlappingPatches(inputBounds: Box2) {
    return this.patches.filter(patch => patch.isOverlapping(inputBounds))
  }

  findPatch(blockPos: Vector2) {
    // const res = this.patches.find(patch => patch.containsPoint(blockPos))
    // return res
    blockPos.floor()
    // compute patch key from which blocks belongs to
    const patchId = getPatchId(blockPos, this.patchDimensions)
    const patchKey = serializePatchId(patchId)
    // look for patch in cache
    const patch = this.patchLookup[patchKey]
    return patch
  }
}

/**
 * Returns block from cache if found, and precache near blocks if needed
 * If not found will compute patch containing block first,
 * and return a promise that will resolve once patch is available in cache
 * @param blockPos
 * @param params
 */
export class GroundCache extends PatchesContainer<GroundPatch> {
  // eslint-disable-next-line no-use-before-define
  static singleton: GroundCache

  static get instance() {
    this.singleton = this.singleton || new GroundCache()
    return this.singleton
  }

  get empty() {
    const emptyPatches = this.patches.filter(patch => patch.isEmpty)
    return emptyPatches
  }

  async loadEmpty(on_the_fly = true) {
    // const patchRequests = WorldComputeProxy.instance.iterPatchCompute(batch)
    if (on_the_fly) {
      // progressive loading
      const patches = this.empty
      async function* asyncGenerator() {
        for (const patch of patches) {
          await patch.fillGroundData()
          yield patch
        }
      }
      return asyncGenerator()
    } else {
      // all at once
      return await Promise.all(
        this.empty.map(async patch => {
          await patch.fillGroundData()
          return patch
        }),
      )
    }
  }

  /**
   * Query block from cache
   * @param blockPos
   * @returns
   */
  queryBlock(
    pos: Vector2,
    { cacheIfMissing, precacheRadius } = {
      cacheIfMissing: false,
      precacheRadius: 0,
    },
  ) {
    const block = this.findPatch(pos)?.getBlock(pos)
    let pendingReq
    if ((!block && cacheIfMissing) || precacheRadius > 0) {
      pendingReq = this.precacheAroundPos(pos, precacheRadius).then(
        () => GroundCache.instance.queryBlock(pos) as PatchBlock,
      ) as Promise<PatchBlock>
    }
    return block || pendingReq
  }

  rebuildPatchIndex(cacheBounds: Box2) {
    const patchKeys = getPatchIds(cacheBounds, this.patchDimensions).map(
      patchId => serializePatchId(patchId),
    )
    const foundOrMissing = patchKeys.map(key => this.patchLookup[key] || key)
    const changesCount = foundOrMissing.filter(
      item => typeof item === 'string',
    ).length
    if (changesCount > 0) {
      const patchLookup: Record<string, GroundPatch> = {}
      foundOrMissing
        .map(item =>
          item instanceof GroundPatch ? item : new GroundPatch(item),
        )
        .forEach(patch => (patchLookup[patch.key] = patch))
      this.patchLookup = patchLookup
    }
    return changesCount
  }

  precacheAroundPos(blockPos: Vector2, precacheRadius = 0) {
    const center = blockPos.clone().floor()
    const precache_dims = new Vector2(
      precacheRadius,
      precacheRadius,
    ).multiplyScalar(2)
    const precache_box = new Box2().setFromCenterAndSize(center, precache_dims)
    GroundCache.instance.rebuildPatchIndex(precache_box)
    return GroundCache.instance.loadEmpty(false)
  }
}

export class GroundMap extends GroundCache {
  mapBounds: Box2 = new Box2()

  // adjustBounds(bounds: Box2) {
  //   this.bounds = bounds
  //   // rebuild patch index
  //   this.rebuildPatchIndex(bounds)
  //   this.loadEmpty()
  // }

  override rebuildPatchIndex(mapBounds: Box2) {
    this.mapBounds = mapBounds
    const patchKeys = getPatchIds(mapBounds, this.patchDimensions).map(
      patchId => serializePatchId(patchId),
    )
    const foundOrMissing = patchKeys.map(key => this.patchLookup[key] || key)
    const changesCount = foundOrMissing.filter(
      item => typeof item === 'string',
    ).length
    if (changesCount > 0) {
      const patchLookup: Record<string, GroundPatch> = {}
      foundOrMissing
        .map(item =>
          item instanceof GroundPatch ? item : new GroundPatch(item),
        )
        .forEach(patch => (patchLookup[patch.key] = patch))
      this.patchLookup = patchLookup
    }
    return changesCount
  }

  // getBlock(blockPos: Vector3) {
  //   return this.findPatch(blockPos)?.getBlock(blockPos, false)
  // }

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

  // *iterAllPatchesBlocks() {
  //   for (const patch of this.availablePatches) {
  //     const blocks = patch.iterOverBlocks(undefined, false, false)
  //     for (const block of blocks) {
  //       yield block
  //     }
  //   }
  // }
}

// get count() {
//   return Object.keys(this.patchLookup).length
// }

// get patchKeys() {
//   return Object.keys(this.patchLookup)
// }

// get availablePatches() {
//   return Object.values(this.patchLookup).filter(val => val) as T[]
// }

// get missingPatchKeys() {
//   return Object.keys(this.patchLookup).filter(
//     key => !this.patchLookup[key],
//   ) as PatchKey[]
// }

// autoFill(fillingVal=0){
//   this.patchKeys.forEach(key=>this.patchLookup[key] = new GroundPatch(key))
//   this.availablePatches.forEach(patch=>patch.iterOverBlocks)
// }

// populateFromExisting(patches: T[], cloneObjects = false) {
//   // const { min, max } = this.bbox
//   patches
//     .filter(patch => this.patchLookup[patch.key] !== undefined)
//     .forEach(patch => {
//       this.patchLookup[patch.key] = cloneObjects
//         ? patch // (patch.duplicate() as T)
//         : patch
//       // min.y = Math.min(patch.bbox.min.y, min.y)
//       // max.y = Math.max(patch.bbox.max.y, max.y)
//     })
// }

// compareWith(otherContainer: PatchesMap<T>) {
//   const patchKeysDiff: Record<string, boolean> = {}
//   // added keys e.g. keys in current container but not found in other
//   Object.keys(this.patchLookup)
//     .filter(patchKey => otherContainer.patchLookup[patchKey] === undefined)
//     .forEach(patchKey => (patchKeysDiff[patchKey] = true))
//   // missing keys e.g. found in other container but not in current
//   Object.keys(otherContainer.patchLookup)
//     .filter(patchKey => this.patchLookup[patchKey] === undefined)
//     .forEach(patchKey => (patchKeysDiff[patchKey] = false))
//   return patchKeysDiff
// }

// getAllPatchesEntities(skipDuplicate = true) {
//   const entities: EntityData[] = []
//   for (const patch of this.availablePatches) {
//     patch.entities.forEach(entity => {
//       if (!skipDuplicate || !entities.find(ent => ent.bbox.equals(entity.bbox))) {
//         entities.push(entity)
//       }
//     })
//   }
//   return entities
// }

// getMergedRows(zRowIndex: number) {
//   const sortedPatchesRows = this.availablePatches
//     .filter(
//       patch => zRowIndex >= patch.bbox.min.z && zRowIndex <= patch.bbox.min.z,
//     )
//     .sort((p1, p2) => p1.bbox.min.x - p2.bbox.min.x)
//     .map(patch => patch.getBlocksRow(zRowIndex))
//   const mergedRows = sortedPatchesRows.reduce((arr1, arr2) => {
//     const mergedArray = new Uint32Array(arr1.length + arr2.length)
//     mergedArray.set(arr1)
//     mergedArray.set(arr2, arr1.length)
//     return mergedArray
//   })
//   return mergedRows
// }

// iterMergedRows() {
//   const { min, max } = this.patchRange
//   for (let zPatchIndex = min.z; zPatchIndex <= max.z; zPatchIndex++) {
//     for (let zRowIndex = min.z; zRowIndex < max.z; zRowIndex++) {}
//   }
// }

// getMergedCols(xColIndex: number) {

// }

// mergedLinesIteration() {
//   const { min, max } = this.bbox
//   for (let x = min.x; x < max.x; x++) {
//     for (let z = min.z; z < max.z; z++) {

//     }
//   }
// }

// toMergedContainer() {
//   const mergedBox = this.availablePatches.map(patch => patch.bbox)
//     .reduce((merge, bbox) => merge.union(bbox), new Box3())
//   // const mergedContainer =
// }

// static fromMergedContainer() {

// }
// mergeBlocks(blocksContainer: BlocksContainer) {
//   // // for each patch override with blocks from blocks container
//   this.availablePatches.forEach(patch => {
//     const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
//     for (const target_block of blocksIter) {
//       const source_block = blocksContainer.getBlock(target_block.pos, false)
//       if (source_block && source_block.pos.y > 0 && target_block.index) {
//         let block_type = source_block.type ? BlockType.SAND : BlockType.NONE
//         block_type =
//           source_block.type === BlockType.TREE_TRUNK
//             ? BlockType.TREE_TRUNK
//             : block_type
//         const block_level = blocksContainer.bbox.min.y // source_block?.pos.y
//         patch.writeBlock(target_block.index, block_level, block_type)
//         // console.log(source_block?.pos.y)
//       }
//     }
//   })
// }
