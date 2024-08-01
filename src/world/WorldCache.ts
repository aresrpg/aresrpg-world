import { Box3, Vector2, Vector3 } from 'three'

import { BlockType } from '../index'

import { WorldApi, WorldApiName } from './WorldApi'
import {
  BlockData,
  BlocksPatch,
  BlockStub,
  EntityChunk,
  PatchStub,
} from './WorldPatch'

/**
 * Blocks cache
 */
export class WorldCache {
  static patchLookupIndex: Record<string, BlocksPatch> = {}
  static bbox = new Box3() // global cache extent
  static pendingRefresh = false
  static cacheCenter = new Vector2(0, 0)
  static cachePowRadius = 3
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
      const patchStub = await WorldApi.instance.call(
        WorldApiName.PatchCompute,
        [patchKey],
      )
      yield patchStub as PatchStub
    }
  }

  static async refresh(
    center: Vector3,
    // worldProxy: WorldProxy = PatchProcessing,
    // asyncMode = false,
  ) {
    const { patchSize } = BlocksPatch
    const { cachePowRadius } = this
    const range = Math.pow(2, cachePowRadius)
    const center_x = Math.floor(center.x / patchSize)
    const center_z = Math.floor(center.z / patchSize)
    const cacheCenter = new Vector2(center_x, center_z)
    const cachePatchCount = Object.keys(this.patchLookupIndex).length
    const batchContent: string[] = []
    if (
      !this.pendingRefresh &&
      (!cacheCenter.equals(this.cacheCenter) || cachePatchCount === 0)
    ) {
      this.pendingRefresh = true
      this.cacheCenter = cacheCenter

      const existing: BlocksPatch[] = []
      for (let xmin = center_x - range; xmin < center_x + range; xmin += 1) {
        for (let zmin = center_z - range; zmin < center_z + range; zmin += 1) {
          // const patchStart = new Vector2(xmin, zmin)
          const patchIndexKey = 'patch_' + xmin + '_' + zmin
          // look for existing patch in current cache
          const patch = this.patchLookupIndex[patchIndexKey] // || new BlocksPatch(patchStart) //BlocksPatch.getPatch(patchBbox, true) as BlocksPatch
          if (!patch) {
            // patch = new BlocksPatch(patchStart)
            // add all patch needing to be filled up
            batchContent.push(patchIndexKey)
          } else {
            existing.push(patch)
          }
        }
      }

      // const updated = existing.filter(patch => patch.state < PatchState.Finalised)
      // const removedCount = Object.keys(WorldCache.patchLookupIndex).length - existing.length
      WorldCache.patchLookupIndex = {}
      existing.forEach(
        patch => (WorldCache.patchLookupIndex[patch.key] = patch),
      )

      const batchIter = WorldCache.processBatchItems(batchContent)
      for await (const patchStub of batchIter) {
        const patch = BlocksPatch.fromStub(patchStub)
        WorldCache.patchLookupIndex[patch.key] = patch
        WorldCache.bbox.union(patch.bbox)
      }
      this.pendingRefresh = false
      return batchContent
    }
    return batchContent
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
}
