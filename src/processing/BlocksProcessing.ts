import { Vector2, Vector3 } from 'three'

import {
  WorldEnv,
  Biome,
  ProcessingTask,
  DensityVolume,
  BlockType,
} from '../index.js'
import {
  serializePatchId,
  getPatchId,
  asVect3,
  asVect2,
  // parseThreeStub,
} from '../utils/convert.js'
import { PatchKey, Block, BlockData } from '../utils/types.js'

import { GroundBlockData, GroundPatch } from './GroundPatch.js'
import { ItemsProcessing } from './ItemsProcessing.js'
import {
  parseTaskInputStubs,
  ProcessingContext,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'

/**
 * Calling side
 */

const blocksProcessingHandlerName = `BlocksProcessing`

export enum BlocksProcessingRecipe {
  Ground,
  Overground,
  Underground,
  Peak,
  Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
  Ceiling,
  Nearest, // nearest ground, floor or ceiling
}

export type BlocksProcessingInput = Vector3[]
export type BlocksProcessingOutput = Block<BlockData>[]
export type BlocksProcessingParams = {
  recipe: BlocksProcessingRecipe
}

// const postProcessTaskResults = (rawOutputData: BlocksProcessingOutput) => {
//   return rawOutputData.map(blockStub => {
//     blockStub.pos = parseThreeStub(blockStub.pos)
//     // return WorldUtils.convert.parseThreeStub(pos)
//     return blockStub
//   }) //as GroundBlock[]
// }

// constructor
const BlocksProcessingTaskConstructor = ProcessingTask<
  BlocksProcessingInput,
  BlocksProcessingParams,
  BlocksProcessingOutput
>

const getBlocksProcessingTask =
  (recipe: BlocksProcessingRecipe) => (input: Vector3[]) => {
    const task = new BlocksProcessingTaskConstructor()
    task.handlerId = blocksProcessingHandlerName
    task.processingInput = input
    task.processingParams = { recipe }
    return task
  }

export const BlocksProcessing = {
  getGroundPositions: getBlocksProcessingTask(BlocksProcessingRecipe.Ground),
  getPeakPositions: getBlocksProcessingTask(BlocksProcessingRecipe.Peak),
  getFloorPositions: getBlocksProcessingTask(BlocksProcessingRecipe.Floor),
  getCeilingPositions: getBlocksProcessingTask(BlocksProcessingRecipe.Ceiling),
}

/**
 * Handling side
 */

type BlocksProcessingTask = ProcessingTask<
  BlocksProcessingInput,
  BlocksProcessingParams,
  BlocksProcessingOutput
>
type BlocksProcessingTaskStub = ProcessingTaskStub<
  BlocksProcessingInput,
  BlocksProcessingParams
>
type BlocksProcessingTaskHandler = ProcessingTaskHandler<
  BlocksProcessingInput,
  BlocksProcessingParams,
  any
>

const getPatchKey = (inputPos: Vector2) => {
  const patchId = getPatchId(inputPos, WorldEnv.current.patchDimensions)
  const patchKey = serializePatchId(patchId)
  return patchKey
}

const createGroundPatch = (patchKey: PatchKey) => {
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.preprocess()
  return groundLayer
}

// const floorPositionsHandler = (input: Vector3[]) => {

// }

// const BlocksProcessingTaskHandlers = {
//   floorPositionsHandler
// }

export const blocksProcessingHandler: BlocksProcessingTaskHandler = (
  taskStub: BlocksProcessingTask | BlocksProcessingTaskStub,
  processingContext = ProcessingContext.None,
) => {
  const { processingInput, processingParams } = taskStub
  const { recipe } = processingParams
  const buildCache: Record<PatchKey, GroundPatch> = {}

  const isAsync = recipe === BlocksProcessingRecipe.Peak

  const getGroundPatch = (requestedPos: Vector2) => {
    const patchKey = getPatchKey(requestedPos)
    // look for existing patch in current cache
    const groundPatch = buildCache[patchKey]
    // if not existing build and insert in cache
    return groundPatch || createGroundPatch(patchKey)
  }

  // const getBuildDeps = (recipe: BlocksProcessingRecipe) => {
  // }

  const bakeBlock = (blockPos: Vector3, recipe: BlocksProcessingRecipe) => {
    const groundPatch = getGroundPatch(asVect2(blockPos))
    const groundBlock = bakeGroundBlock(blockPos, groundPatch)
    if (recipe === BlocksProcessingRecipe.Ground) return groundBlock
    else if (recipe === BlocksProcessingRecipe.Peak) {
      // build deps
      const peakBlock = bakePeakBlock(groundBlock)
      return peakBlock
    } else if (recipe === BlocksProcessingRecipe.Floor) {
      const initialBlockLevel = Math.round(groundBlock.pos.y / 2) // blockPos.y // groundBlock.data.level + 1
      const floorBlock = bakeFloorBlock(groundBlock, initialBlockLevel)
      return floorBlock
    } else if (recipe === BlocksProcessingRecipe.Ceiling) {
      const ceilingBlock = bakeCeilingBlock(
        groundBlock,
        groundBlock.data.level + 1,
      )
      return ceilingBlock
    }
    // return block as Block<BlockData>
  }

  const parsedInput =
    processingContext === ProcessingContext.Worker
      ? (parseTaskInputStubs(...processingInput) as BlocksProcessingInput)
      : processingInput
  const blocksProcessing = parsedInput.map(requestedPos =>
    bakeBlock(requestedPos, recipe),
  )
  return isAsync ? Promise.all(blocksProcessing) : blocksProcessing
}

// const res = await BlocksProcessing.getFloorPositions([]).delegate()

ProcessingTask.taskHandlers[blocksProcessingHandlerName] =
  blocksProcessingHandler

/**
 * Processing
 */

/**
 * requires: ground patch
 * provides: ground block
 */
const bakeGroundBlock = (pos: Vector3, groundPatch: GroundPatch) => {
  const groundData = groundPatch?.computeGroundBlock(pos)
  // return groundData
  // }).filter(val => val) as GroundBlockData[]
  // const batchOutput = groundBlocksData.map(groundData => {
  const { biome, landIndex, level } = groundData as GroundBlockData
  const landscapeConf = Biome.instance.mappings[biome].nth(landIndex)
  const groundConf = landscapeConf.data
  const blockData: BlockData = {
    level,
    type: groundConf.type,
  }
  const block: Block<BlockData> = {
    pos,
    data: blockData,
  }
  return block
}

/**
 * provides: highest overground block
 * usage: LOD
 */
const bakePeakBlock = async (groundBlock: Block<BlockData>) => {
  const peakBlock = await ItemsProcessing.pointPeakBlock(
    asVect2(groundBlock.pos),
  ).process()
  if (peakBlock.type !== BlockType.NONE) {
    groundBlock.data.level = peakBlock.level
    groundBlock.data.type = peakBlock.type
  }
  return groundBlock
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
  initialBlockLevel: number,
) => {
  const groundLevel = groundBlock.pos.y
  const groundPos = asVect2(groundBlock.pos)

  const isEmptyBlock = (level: number) =>
    DensityVolume.instance.getBlockDensity(
      asVect3(groundPos, level),
      groundLevel + 20,
    )
  let currentLevel = initialBlockLevel
  // above ground level
  if (currentLevel > groundLevel) {
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

// or build artefacts
// type BuildData = {
//   groundPatch: GroundPatch
//   groundBlock?: Block<BlockData>
//   overgroundBlocks?: number[]
//   undergroundBlocks?: number[]
// }
