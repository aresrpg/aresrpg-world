import { Box2, Vector2 } from 'three'

import {
  WorldEnv,
  Biome,
  ProcessingTask,
  ChunkContainer,
  DensityVolume,
} from '../index'
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

export enum BlocksProcessingRecipe {
  Ground,
  Overground,
  Underground,
  Peak,
  Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
  Ceiling,
  Nearest, // nearest ground, floor or ceiling
}

export type BlocksProcessingParams = {
  recipe: BlocksProcessingRecipe
}

const defaultProcessingParams: BlocksProcessingParams = {
  recipe: BlocksProcessingRecipe.Ground,
}

export type BuildCache = {}

/**
 * requires: ground patch
 * provides: ground block
 */
const bakeGroundBlock = (pos: Vector2, groundPatch: GroundPatch) => {
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
    pos: asVect3(pos, blockData.level),
    data: blockData,
  }
  return block
}

/**
 * needs: ground block
 * provides: all block above ground surface
 * @param pos
 */
const bakeOvergroundBlocks = async (groundBlock: Block<BlockData>) => {
  const queriedLoc = new Box2().setFromPoints([asVect2(groundBlock.pos)])
  queriedLoc.max.addScalar(1)
  const itemsProcessor = new ItemsBaker(queriedLoc, groundBlock.pos)
  const overgroundBlocks = await itemsProcessor.queryIsolatedPoint()
  return overgroundBlocks
}

/**
 * all blocks below ground surface
 */
const bakeUndergroundBlocks = (groundBlock: Block<BlockData>) => {
  const groundLevel = groundBlock.pos.y
  const groundPos = asVect2(groundBlock.pos)
  const undergroundBlocks: number[] = []
  for (let y = 0; y < groundLevel; y++) {
    const isEmptyBlock = DensityVolume.instance.getBlockDensity(
      asVect3(groundPos, y),
      groundLevel + 20,
    )
    undergroundBlocks.push(isEmptyBlock ? 0 : 1)
  }
  return undergroundBlocks
}

/**
 * needs: overground blocks
 * provides: highest overground block
 * usage: LOD
 */
const bakePeakBlock = (
  groundBlock: Block<BlockData>,
  overgroundBlocks: number[],
) => {
  const lastIndex = overgroundBlocks.findLastIndex(elt => elt)
  const lastBlockType = lastIndex >= 0 && overgroundBlocks[lastIndex]
  const blockType = lastBlockType
    ? ChunkContainer.dataDecoder(lastBlockType)
    : groundBlock.data.type
  groundBlock.data.level += lastIndex
  groundBlock.data.type = blockType
  return groundBlock
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
 * to avoid spawning above schematics like trees returned block should not be
 * above schematic block or not at greater distance from ground surface
 * usage: random spawn above floor surface
 *
 */
// start with normal query to find ground level,
// - if requested pos is above ground: returns ground pos provided there is no
// schematic blocks at given location or schematics blocks are lesser than predefined value
// - if requested pos is below ground: look down or up for closest empty block
// stop iterating in up direction if reaching ground surface with schematic block
// offset from requested pos
const bakeFloorBlock = (
  groundBlock: Block<BlockData>,
  requestedBlockLevel: number,
) => {
  const groundLevel = groundBlock.pos.y
  const groundPos = asVect2(groundBlock.pos)

  const isEmptyBlock = (level: number) =>
    DensityVolume.instance.getBlockDensity(
      asVect3(groundPos, level),
      groundLevel + 20,
    )
  let currentLevel = requestedBlockLevel
  // above ground level
  if (requestedBlockLevel > groundLevel) {
    currentLevel = groundLevel
  }
  // below ground level
  else {
    // if current block not empty, find first empty below
    while (!isEmptyBlock(currentLevel) && currentLevel-- >= 0);
    // then look below for last empty block
    while (isEmptyBlock(currentLevel) && currentLevel-- >= 0);
  }
  // groundBlock.pos.y = currentLevel
  groundBlock.data.level = currentLevel
  return groundBlock
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

/**
 * needs:
 * provides: nearest ceiling block
 */
const bakeCeilingBlock = (
  groundBlock: Block<BlockData>,
  requestedBlockLevel: number,
) => {
  console.log(groundBlock)
  console.log(requestedBlockLevel)
}

type BuildArtefacts = {
  groundPatch: GroundPatch
  groundBlock?: Block<BlockData>
  overgroundBlocks?: number[]
  undergroundBlocks?: number[]
}

const getPatchKey = (requestedPos: Vector2) => {
  const patchId = getPatchId(requestedPos, WorldEnv.current.patchDimensions)
  const patchKey = serializePatchId(patchId)
  return patchKey
}

const getGroundPatch = (patchKey: PatchKey) => {
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.preprocess()
  return groundLayer
}

export class BlockProcessor {
  requestedPos: Vector2
  buildStack: BuildArtefacts

  constructor(requestedPos: Vector2, groundPatch?: GroundPatch) {
    this.requestedPos = requestedPos
    groundPatch = groundPatch || getGroundPatch(getPatchKey(requestedPos))
    this.buildStack = { groundPatch }
  }

  getGroundBlock() {
    const { requestedPos } = this
    const { groundBlock, groundPatch } = this.buildStack
    return groundBlock || bakeGroundBlock(requestedPos, groundPatch)
  }

  async getOvergroundBlocks() {
    return (
      this.buildStack.overgroundBlocks ||
      (await bakeOvergroundBlocks(this.getGroundBlock()))
    )
  }

  getUndergroundBlocks() {
    return (
      this.buildStack.undergroundBlocks ||
      bakeUndergroundBlocks(this.getGroundBlock())
    )
  }

  async getPeakBlock() {
    // build requirements
    const overgroundBlocks = await this.getOvergroundBlocks()
    const peakBlock = bakePeakBlock(this.getGroundBlock(), overgroundBlocks)
    return peakBlock
  }

  getFloorBlock() {
    const groundBlock = this.getGroundBlock()
    const floorBlock = bakeFloorBlock(groundBlock, groundBlock.data.level + 1)
    return floorBlock
  }

  getCeilingBlock() {
    const groundBlock = this.getGroundBlock()
    const floorBlock = bakeCeilingBlock(groundBlock, groundBlock.data.level + 1)
    return floorBlock
  }

  bakeRecipe = async (recipe: BlocksProcessingRecipe) => {
    if (recipe === BlocksProcessingRecipe.Ground) {
      return this.getGroundBlock()
    } else if (recipe === BlocksProcessingRecipe.Overground) {
      return await this.getOvergroundBlocks()
    } else if (recipe === BlocksProcessingRecipe.Underground) {
      return this.getUndergroundBlocks()
    } else if (recipe === BlocksProcessingRecipe.Peak) {
      return this.getPeakBlock()
    } else if (recipe === BlocksProcessingRecipe.Floor) {
      return this.getFloorBlock()
    } else if (recipe === BlocksProcessingRecipe.Ceiling) {
      return this.getCeilingBlock()
    }
    return {}
  }
}

/**
 * Surface blocks
 */
export class BlocksProcessing extends ProcessingTask {
  buildCache: Record<PatchKey, GroundPatch> = {}
  blocks: any[] = []
  input: Vector2[] = []
  output: any[] = []
  constructor(posBatch: Vector2[]) {
    super()
    this.input = posBatch
  }

  override get inputs() {
    return [this.input]
  }

  /**
   * requires:
   * - requestedPos
   * - cache
   * provides:
   * - ground patch
   */
  getGroundPatch(requestedPos: Vector2) {
    const patchKey = getPatchKey(requestedPos)
    // look for existing patch in current cache
    const groundPatch = this.buildCache[patchKey]
    // if not existing build and insert in cache
    return groundPatch || getGroundPatch(patchKey)
  }

  override async process(processingParams = defaultProcessingParams) {
    const { recipe } = processingParams
    const pendingBlocks = this.input.map(async pos => {
      const groundPatch = this.getGroundPatch(pos)
      const blockProcessor = new BlockProcessor(pos, groundPatch)
      const block = await blockProcessor.bakeRecipe(recipe)
      return block
    })
    const batchOutput = await Promise.all(pendingBlocks)
    return batchOutput
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
