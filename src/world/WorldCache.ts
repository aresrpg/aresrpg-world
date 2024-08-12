import { Box3, Vector2, Vector3 } from 'three'
import { BlockType } from '../index'

import { WorldApi, WorldApiName } from './WorldApi'
import {
  BlockData,
  BlocksPatch,
  BlockStub,
  EntityChunk,
  PatchContainer,
  PatchStub,
} from '../data/Patches'

/**
 * Blocks cache
 */
export class WorldCache {
  static bbox = new Box3() // global cache extent
  // static lastCacheBox = new Box3()
  static pendingRefresh = false
  static cachePowRadius = 2
  static cacheSize = BlocksPatch.patchSize * 5
  static patchContainer = new PatchContainer(new Box3())
  // static worldApi = new WorldApi()

  // groundBlocks: Uint16Array = new Uint16Array(Math.pow(PatchBase.patchSize, 2))

  entitiesChunks: EntityChunk[] = []

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

  static async populate(patchContainer: PatchContainer, dryRun = false) {
    const batchContent = patchContainer.missingPatchKeys
    if (!dryRun && batchContent.length > 0) {
      this.pendingRefresh = true

      const batchIter = WorldCache.processBatchItems(batchContent)
      // populate cache
      for await (const patchStub of batchIter) {
        const patch = BlocksPatch.fromStub(patchStub)
        patchContainer.patchLookup[patch.key] = patch
        patchContainer.bbox.union(patch.bbox)
      }
      this.pendingRefresh = false
    }
    return batchContent
  }

  /**
   * 
   * @param center 
   * @param dryRun 
   * @returns true if cache was update, false otherwise
   */
  static async refresh(
    bbox: Box3,
    dryRun = false
  ) {
    const changes: any = {
      count: 0,
      batch: []
    }
    if (!this.pendingRefresh) {
      const patchContainer = new PatchContainer(bbox)
      const patchDiff = patchContainer.diffWithPatchContainer(this.patchContainer)
      changes.count = Object.keys(patchDiff).length
      // (!cacheCenter.equals(this.cacheCenter) || cachePatchCount === 0)
      if (changes.count) {
        patchContainer.fillFromPatches(this.patchContainer.availablePatches)
        this.patchContainer = patchContainer
        changes.batch = await this.populate(patchContainer, dryRun)
      }
    }
    return changes
  }

  static getPatch(inputPoint: Vector2 | Vector3) {
    const point = new Vector3(
      inputPoint.x,
      0,
      inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    )

    const res = this.patchContainer.availablePatches.find(
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
    const res = this.patchContainer.availablePatches.filter(patch =>
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
    const { bbox } = this.patchContainer
    let res
    globalPos.y = bbox.getCenter(new Vector3()).y
    if (bbox.containsPoint(globalPos)) {
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

  static async getTopLevelBlock(globalPos: Vector3) {
    const block = await WorldCache.getGroundBlock(globalPos)
    if (block) {
      const blocksBuffer = (await WorldApi.instance.call(
        WorldApiName.OvergroundBufferCompute,
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
    const patches = this.patchContainer.availablePatches
    const bbox = patches.reduce(
      (bbox, patch) => bbox.union(patch?.bbox || new Box3()),
      new Box3(),
    )
    console.log(patchKeys)
  }
}
