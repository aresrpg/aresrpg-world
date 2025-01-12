import { Box2, Vector2 } from 'three'

import { WorldEnv, Biome, ProcessingTask, ChunkContainer } from '../index'
import {
  serializePatchId,
  getPatchId,
  asVect3,
  asVect2,
  parseThreeStub,
} from '../utils/convert'
import { PatchKey, GroundBlock, Block, BlockData } from '../utils/types'

import { GroundBlockData, GroundPatch } from './GroundPatch'
import { ItemsBaker } from './ItemsProcessing'

export type BlocksBatchArgs = {
  posBatch: Vector2[]
}

export enum BlocksProcessingMode {
  Ground,
  Peak,
  Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
  Ceiling,
  Nearest, // nearest ground, floor or ceiling
}

export type BlocksProcessingParams = {
  mode: BlocksProcessingMode
}

const defaultProcessingParams: BlocksProcessingParams = {
  mode: BlocksProcessingMode.Ground,
}

/**
 * Surface blocks
 */
export class BlocksProcessing extends ProcessingTask {
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
    return [this.input]
  }

  override async process(processingParams = defaultProcessingParams) {
    const { mode } = processingParams
    // console.log(groundLevel)
    this.initCache()

    switch (mode) {
      case BlocksProcessingMode.Ground: {
        const batchOutput = this.input.map(pos => {
          // const blockData =
          // const block: Block<BlockData> = {
          //   pos: asVect3(pos),
          //   data: blockData,
          // }
          const block = this.queryGroundBlock(pos)
          return block
        })
        return batchOutput
      }
      case BlocksProcessingMode.Peak: {
        const batchOutput = await Promise.all(
          this.input.map(pos => this.queryPeakBlock(pos)),
        )
        return batchOutput
      }
      // case BlocksProcessingMode.Floor: {
      //   const batchOutput = this.input.map(pos => this.queryNearestGroundFloor(pos))
      //   return batchOutput
      // }
    }
    return [] as Block<BlockData>[]
  }

  queryGroundBlock(pos: Vector2) {
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
      level,
      type: groundConf.type,
    }
    const block: Block<BlockData> = {
      pos: asVect3(pos),
      data: blockData,
    }
    return block
  }

  // for LOD generation use
  async queryPeakBlock(pos: Vector2) {
    const block = this.queryGroundBlock(pos)
    block.pos.y = block.data.level
    const queriedLoc = new Box2().setFromPoints([asVect2(block.pos)])
    queriedLoc.max.addScalar(1)
    const itemsProcessor = new ItemsBaker(queriedLoc, block.pos)
    const bufferData = await itemsProcessor.queryIsolatedPoint()
    const lastIndex = bufferData.findLastIndex(elt => elt)
    const lastBlockType = lastIndex >= 0 && bufferData[lastIndex]
    const blockType = lastBlockType
      ? ChunkContainer.dataDecoder(lastBlockType)
      : block.data.type
    block.data.level += lastIndex
    block.data.type = blockType
    return block
    // const blockPos = asVect3(pos)
    // const blockData = computeGroundBlock(blockPos)
    // const { spawnableItems } = blockData

    // false && includeEntitiesBlocks && spawnableItems.forEach(itemType => {
    //   // several (overlapping) objects may be found at queried position
    //   const [spawnedEntity] = ItemsInventory.querySpawnedEntities(itemType, queriedLoc)
    //   const lastBlockIndex = blocksBuffer?.findLastIndex(elt => elt)
    //   if (blocksBuffer && lastBlockIndex && lastBlockIndex >= 0) {
    //     blockData.level += lastBlockIndex
    //     blockData.type = blocksBuffer[lastBlockIndex] as BlockType
    //   }

    // override with last block if specified
    // if (params.includeEntitiesBlocks) {
    //     const lastBlockData = await queryLastBlockData(blockPos)
    //     block.data =
    //         lastBlockData.level > 0 && lastBlockData.type
    //             ? lastBlockData
    //             : (block.data as any)
    // }
    // return block //blockData?.level || 0//getHeight()
  }

  /**
   * for mob random spawn use
   * returned block should not be above schematic block (to avoid spawning above trees)
   */
  queryNearestGroundFloor() {
    // start with normal query to find ground level,
    // - if requested pos in the air: returns ground pos if no schematic block
    // or look underneath for closer underground empty block
    // - if requested pos is below ground surface: look down or up for closest empty block
    // stop iterating in up direction if reaching ground surface with schematic block
    // offset from requested pos
    // const y = 0
    // const groundLevel = 0
    // let offset = 0
    // let done = false
    // while (!done) {
    //   // look above
    //   if (y + offset < groundLevel) {
    //     // if found return offset
    //   }
    //   // look below
    //   if (y - offset > 0) {
    //     // if found return - offset
    //     block.pos.y = y
    //     const isEmptyBlock = DensityVolume.instance.getBlockDensity(
    //       block.pos,
    //       groundLevel + 20,
    //     )
    //   }
    //   offset++
    // }
  }

  override reconcile(stubs: GroundBlock[]) {
    return stubs.map(blockStub => {
      blockStub.pos = parseThreeStub(blockStub.pos)
      // return WorldUtils.convert.parseThreeStub(pos)
      return blockStub
    }) as GroundBlock[]
  }

  toStub() {
    return this.output
  }
}

ProcessingTask.registeredObjects[BlocksProcessing.name] = BlocksProcessing
