import { Vector2 } from 'three'

import { computeGroundBlock } from '../api/world-compute'
import { WorldEnv, Biome, WorldUtils, WorldComputeProxy } from '../index'
import { serializePatchId, getPatchId, asVect3 } from '../utils/convert'
import {
  PatchKey,
  GroundBlock,
  WorldProcess,
  ProcessType,
} from '../utils/types'

import { GroundPatch } from './GroundPatch'

export type BlocksBatchArgs = {
  posBatch: Vector2[]
}

export class BlocksBatch implements WorldProcess {
  patchIndex: Record<PatchKey, Vector2[]> = {}
  blocks: any[] = []
  constructor(posBatch: Vector2[]) {
    // sort input blocks by patch
    // const blocksByPatch: Record<PatchKey, GroundBlock[]> = {}
    for (const pos of posBatch) {
      const patchId = getPatchId(pos, WorldEnv.current.patchDimensions)
      const patchKey = serializePatchId(patchId)
      this.patchIndex[patchKey] = this.patchIndex[patchKey] || []
      this.patchIndex[patchKey]?.push(pos)
    }
  }

  bake() {}

  async process() {
    // const blocksBatch = posBatch.map(pos => {

    //     const data: BlockData = {
    //         level: 0,
    //         type: BlockType.NONE,
    //     }
    //     const block: Block<BlockData> = {
    //         pos: asVect3(pos),
    //         data,
    //     }

    //     return block
    // })
    const blocksBatch = []
    for (const [patchKey, posBatch] of Object.entries(this.patchIndex)) {
      const groundPatch = new GroundPatch(patchKey)
      const biomeBoundsInfluences = Biome.instance.getBoundsInfluences(
        groundPatch.bounds,
      )
      for (const blockPos of posBatch) {
        const blockBiome = WorldUtils.process.getBlockBiome(
          blockPos,
          groundPatch.bounds,
          biomeBoundsInfluences,
        )
        const blockData = computeGroundBlock(asVect3(blockPos), blockBiome)
        // const {level, type } =
        // override with last block if specified
        // if (params.includeEntitiesBlocks) {
        //     const lastBlockData = await queryLastBlockData(blockPos)
        //     block.data =
        //         lastBlockData.level > 0 && lastBlockData.type
        //             ? lastBlockData
        //             : (block.data as any)
        // }
        blockPos.y = blockData.level
        const block = {
          pos: asVect3(blockPos),
          data: blockData,
        }
        blocksBatch.push(block)
      }
    }
    this.blocks = blocksBatch
    // return blocksBatch
    // const blocksBatch = blockPosBatch.map((pos) => {
    //   const blockPos = asVect3(pos)
    //   const blockData = computeGroundBlock(blockPos)
    //   const { spawnableItems } = blockData
    //   const queriedLoc = new Box2().setFromPoints([asVect2(blockPos)])
    //   queriedLoc.max.addScalar(1)
    //   false && includeEntitiesBlocks && spawnableItems.forEach(itemType => {
    //     // several (overlapping) objects may be found at queried position
    //     const [spawnedEntity] = ItemsInventory.querySpawnedEntities(itemType, queriedLoc)
    //     const lastBlockIndex = blocksBuffer?.findLastIndex(elt => elt)
    //     if (blocksBuffer && lastBlockIndex && lastBlockIndex >= 0) {
    //       blockData.level += lastBlockIndex
    //       blockData.type = blocksBuffer[lastBlockIndex] as BlockType
    //     }
    //   })
    //   blockPos.y = blockData.level
    //   const block: Block = {
    //     pos: blockPos,
    //     data: blockData,
    //   }
    //   return block
    // })
  }

  toStub() {
    return this.blocks
  }

  // byProxy
  static async proxyGen(
    posBatch: Vector2[],
    processingUnit = WorldComputeProxy.workerPool,
  ) {
    const res = (await processingUnit
      .exec(ProcessType.BlocksBatch, [posBatch])
      .then((blocksStubs: GroundBlock[]) => {
        // parse worker's data to recreate original objects
        const blocks = blocksStubs.map(blockStub => {
          blockStub.pos = WorldUtils.convert.parseThreeStub(blockStub.pos)
          return blockStub
        }) as GroundBlock[]
        return blocks
      })) as GroundBlock[]
    return res
  }
}
