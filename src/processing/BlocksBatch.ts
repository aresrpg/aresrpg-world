import { Vector2 } from 'three'
import { WorldEnv, WorldUtils, Biome, ProcessingTask } from '../index'
import { serializePatchId, getPatchId, asVect3 } from '../utils/convert'
import {
  PatchKey,
  GroundBlock,
  Block,
  BlockData,
} from '../utils/types'

import { GroundBlockData, GroundPatch } from './GroundPatch'

export type BlocksBatchArgs = {
  posBatch: Vector2[]
}

export type BlocksBatchProcessingParams = {
  groundLevel: false,
}

const defaultProcessingParams: BlocksBatchProcessingParams = {
  groundLevel: false
}

export class BlocksBatch extends ProcessingTask {
  localPatchCache: Record<PatchKey, GroundPatch> = {}
  patchIndex: Record<PatchKey, Vector2[]> = {}
  blocks: any[] = []
  input: Vector2[] = []
  output: any[] = []
  constructor(posBatch: Vector2[]) {
    super()
    // sort input blocks by patch
    // const blocksByPatch: Record<PatchKey, GroundBlock[]> = {}
    for (const pos of posBatch) {
      const patchId = getPatchId(pos, WorldEnv.current.patchDimensions)
      const patchKey = serializePatchId(patchId)
      this.patchIndex[patchKey] = this.patchIndex[patchKey] || []
      this.patchIndex[patchKey]?.push(pos)
    }
    this.input = posBatch
  }

  asBatch() {
    const posBatch: Vector2[] = []
    Object.values(this.patchIndex).forEach(posArr => posBatch.push(...posArr))
    return posBatch
  }

  initCache() {
    for (const patchKey of Object.keys(this.patchIndex)) {
      const groundLayer = new GroundPatch(patchKey)
      groundLayer.preprocess()
      this.localPatchCache[patchKey] = groundLayer
    }
  }

  override get inputs() {
    return ([this.input])
  }

  override reconcile(stubs: GroundBlock[]) {
    return stubs.map(pos => {
      // blockStub.pos = WorldUtils.convert.parseThreeStub(blockStub.pos)
      return WorldUtils.convert.parseThreeStub(pos)
    }) as GroundBlock[]
  }

  override async process(processingParams = defaultProcessingParams) {
    const { groundLevel } = processingParams
    console.log(groundLevel)
    this.initCache()

    // const groundBlocksData = this.input.map(pos => {
    const batchOutput = this.input.map(pos => {
      const patchId = getPatchId(pos, WorldEnv.current.patchDimensions)
      const patchKey = serializePatchId(patchId)
      const groundPatch = this.localPatchCache[patchKey]
      const groundData = groundPatch?.computeGroundBlock(asVect3(pos))
      // return groundData
      // }).filter(val => val) as GroundBlockData[]
      // const batchOutput = groundBlocksData.map(groundData => {
      const { biome, landscapeIndex, level } = groundData as GroundBlockData
      const landscapeConf = Biome.instance.mappings[biome].nth(landscapeIndex)
      const groundConf = landscapeConf.data
      const blockData: BlockData = {
        level: level,
        type: groundConf.type
      }
      const block: Block<BlockData> = {
        pos: asVect3(pos),
        data: blockData
      }
      return block
      // override with last block if specified
      // if (params.includeEntitiesBlocks) {
      //     const lastBlockData = await queryLastBlockData(blockPos)
      //     block.data =
      //         lastBlockData.level > 0 && lastBlockData.type
      //             ? lastBlockData
      //             : (block.data as any)
      // }
      // return block //blockData?.level || 0//getHeight()
    })
    this.output = batchOutput

    // this.blocks = blocksBatch
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
  }

  toStub() {
    return this.output
  }
}

ProcessingTask.registeredObjects[BlocksBatch.name] = BlocksBatch

