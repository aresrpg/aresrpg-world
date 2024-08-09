import { Box3, Vector2, Vector3 } from 'three'
import { asVect3 } from '../common/utils'

import { BlockType } from '../index'

import { WorldApi, WorldApiName } from './WorldApi'
import {
  BlockData,
  BlocksPatch,
  BlockStub,
  EntityChunk,
  PatchStub,
} from './WorldData'

/**
 * Blocks cache
 */
export class WorldCache {
  static patchLookupIndex: Record<string, BlocksPatch> = {}
  static bbox = new Box3() // global cache extent
  static lastCacheBox = new Box3()
  static pendingRefresh = false
  static cachePowRadius = 2
  static cacheSize = BlocksPatch.patchSize * 5
  // static worldApi = new WorldApi()

  // groundBlocks: Uint16Array = new Uint16Array(Math.pow(PatchBase.patchSize, 2))

  entitiesChunks: EntityChunk[] = []

  addPatch(patchStub: PatchStub) {
    const patch = BlocksPatch.fromStub(patchStub)
    WorldCache.bbox.union(patch.bbox)
  }

  static async *processBatchItems(batchContent: string[]) {
    for (const patchKey of batchContent) {
      const emptyPatch = new BlocksPatch(patchKey)
      const patchStub = await WorldApi.instance.call(
        WorldApiName.PatchCompute,
        [emptyPatch.bbox]//[patchKey],
      )
      yield patchStub as PatchStub
    }
  }

  static async processBlocksBatch(batchContent: Vector3[]) {
    const batchRes = await WorldApi.instance.call(
      WorldApiName.BlocksBatchCompute,
      [batchContent],
    )
    return batchRes
  }

  static genPatchKeys(bbox: Box3) {
    const batchKeys: Record<string, any> = {};
    const halfDimensions = bbox.getSize(new Vector3()).divideScalar(2)
    const range = BlocksPatch.asPatchCoords(halfDimensions)
    const center = bbox.getCenter(new Vector3())
    const origin = BlocksPatch.asPatchCoords(center)
    for (let xmin = origin.x - range.x; xmin < origin.x + range.x; xmin += 1) {
      for (let zmin = origin.y - range.y; zmin < origin.y + range.y; zmin += 1) {
        const patch_key = 'patch_' + xmin + '_' + zmin;
        batchKeys[patch_key] = true
      }
    }
    return batchKeys
  }

  static genDiffBatch(bbox: Box3) {
    const prevBatchKeys = WorldCache.genPatchKeys(bbox)
    const currBatchKeys = WorldCache.genPatchKeys(WorldCache.lastCacheBox)
    const batchKeysDiff: Record<string, any> = {}
    // Object.keys(currBatchKeys).forEach(batchKey=>currBatchKeys[batchKey] = !prevBatchKeys[batchKey])
    Object.keys(currBatchKeys)
      .filter(batchKey => !prevBatchKeys[batchKey])
      .forEach(batchKey => batchKeysDiff[batchKey] = true)
    WorldCache.lastCacheBox = bbox
    return batchKeysDiff
  }

  static async refresh(
    center: Vector3,
    // worldProxy: WorldProxy = PatchProcessing,
    // asyncMode = false,
  ) {
    const { patchSize } = BlocksPatch
    const { cachePowRadius } = this
    // const cachePatchCount = Object.keys(this.patchLookupIndex).length
    const range = Math.pow(2, cachePowRadius)
    const origin = BlocksPatch.asPatchCoords(center)
    const boxCenter = asVect3(origin).multiplyScalar(patchSize)
    const boxDims = new Vector3(range, 0, range).multiplyScalar(2 * patchSize)
    const bbox = new Box3().setFromCenterAndSize(boxCenter, boxDims)
    const required = this.genPatchKeys(bbox)
    Object.keys(required)
      .forEach(patchKey => required[patchKey] = this.patchLookupIndex[patchKey])
    // exclude cached items from batch  
    const batchContent = this.pendingRefresh ? [] : Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k,]) => k)
    // (!cacheCenter.equals(this.cacheCenter) || cachePatchCount === 0)
    if (batchContent.length > 0) {
      this.pendingRefresh = true
      // this.cacheCenter = origin
      // clear cache
      WorldCache.patchLookupIndex = {}
      const remaining = Object.values(required).filter(val => val)
      // restore remaining items in cache
      remaining.forEach(
        patch => (WorldCache.patchLookupIndex[patch.key] = patch),
      )
      const batchIter = WorldCache.processBatchItems(batchContent)
      for await (const patchStub of batchIter) {
        const patch = BlocksPatch.fromStub(patchStub)
        WorldCache.patchLookupIndex[patch.key] = patch
        WorldCache.bbox.union(patch.bbox)
      }
      this.pendingRefresh = false
    }
  }


  static getPatch(inputPoint: Vector2 | Vector3) {
    const point = new Vector3(
      inputPoint.x,
      0,
      inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    )

    const res = Object.values(this.patchLookupIndex).find(
      patch =>
        point.x >= patch.bbox.min.x &&
        point.z >= patch.bbox.min.z &&
        point.x < patch.bbox.max.x &&
        point.z < patch.bbox.max.z,
    )
    return res
  }

  static getPatches(inputBbox: Box3) {
    const bbox = inputBbox.clone()
    bbox.min.y = 0
    bbox.max.y = 512
    const res = Object.values(this.patchLookupIndex).filter(patch =>
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
      .map(patchCenter => WorldCache.getPatch(patchCenter))
      .filter(patch => patch) as BlocksPatch[]
    return patchNeighbours
  }

  static getGroundBlock(globalPos: Vector3) {
    let res
    globalPos.y = WorldCache.bbox.getCenter(new Vector3()).y
    if (WorldCache.bbox.containsPoint(globalPos)) {
      const patch = WorldCache.getPatch(globalPos)
      if (patch) {
        const localPos = globalPos.clone().sub(patch.bbox.min)
        res = patch.getBlock(localPos) as BlockData
      }
    } else {
      res = WorldApi.instance
        .call(WorldApiName.GroundBlockCompute, [globalPos])
        .then(blockStub => {
          const block = {
            pos: new Vector3(
              globalPos.x,
              (blockStub as BlockStub).level,
              globalPos.z,
            ),
            type: (blockStub as BlockStub).type,
          }
          return block
        })
      if (!res) {
        console.log(res)
      }
    }
    return res
  }

  static async getOvergroundBlock(globalPos: Vector3) {
    const block = await WorldCache.getGroundBlock(globalPos)
    if (block) {
      const blocksBuffer = (await WorldApi.instance.call(
        WorldApiName.OvergroundBlocksCompute,
        [block.pos],
      )) as BlockType[]
      const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
      if (lastBlockIndex >= 0) {
        block.pos.y += lastBlockIndex
        block.type = blocksBuffer[lastBlockIndex] as BlockType
      }
    }
    return block
  }

  static setBlock(globalPos: Vector3, block: BlockData) {
    // find patch containing point in cache
    const patch = this.getPatch(globalPos)
    if (patch) {
      const localPos = globalPos.clone().sub(patch.bbox.min)
      patch.setBlock(localPos, block.type)
    } else {
      console.log(globalPos)
    }
    return block
  }

  static buildPlateau(patchKeys: string[]) {
    const patches = patchKeys.map(patchKey => this.patchLookupIndex[patchKey])
    const bbox = patches.reduce(
      (bbox, patch) => bbox.union(patch?.bbox || new Box3()),
      new Box3(),
    )
    console.log(patchKeys)
  }
}
