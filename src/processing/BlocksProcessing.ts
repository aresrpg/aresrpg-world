import { Vector2, Vector3 } from 'three'

import {
  serializePatchId,
  getPatchId,
  asVect3,
  asVect2,
  // parseThreeStub,
} from '../utils/patch_chunk.js'
import { PatchKey, Block, BlockData, BlockType } from '../utils/common_types.js'
import { WorldModules } from '../WorldModules.js'

import { GroundBlockData, GroundPatch } from './GroundPatch.js'
import {
  ItemsProcessing,
  itemsProcessingHandlerName,
} from './ItemsProcessing.js'
import {
  parseTaskInputStubs,
  ProcessingContext,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'

/**
 * Calling side
 */

export const blocksProcessingHandlerName = `BlocksProcessing`

export enum BlocksProcessingRecipe {
  Ground,
  Overground,
  Underground,
  Peak,
  Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
  Ceiling,
  Nearest, // nearest ground, floor or ceiling
}

export enum BlocksDataFormat {
  XYZ_VectorArray,
  XZ_FloatArray
}

export type BlocksProcessingInput = Vector3[] | Float32Array
export type BlocksProcessingOutput = Block<BlockData>[]
export type BlocksProcessingParams = {
  recipe: BlocksProcessingRecipe
  includeDensity?: boolean
  dataFormat?: BlocksDataFormat
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

// const floorPositionsHandler = (input: Vector3[]) => {

// }

// const BlocksProcessingTaskHandlers = {
//   floorPositionsHandler
// }

export const createBlocksTaskHandler = (worldModules: WorldModules, processingContext = ProcessingContext.None) => {
  const { worldLocalEnv, taskHandlers } = worldModules
  const blocksTaskHandler: BlocksProcessingTaskHandler = (
    taskStub: BlocksProcessingTask | BlocksProcessingTaskStub
  ) => {
    const patchDim = worldLocalEnv.getPatchDimensions()
    const { processingInput, processingParams } = taskStub
    const { recipe, includeDensity, dataFormat } = processingParams
    const buildCache: Record<PatchKey, GroundPatch> = {}

    const isAsync = recipe === BlocksProcessingRecipe.Peak

    const getPatchKey = (inputPos: Vector2) => {
      const patchId = getPatchId(inputPos, patchDim)
      const patchKey = serializePatchId(patchId)
      return patchKey
    }

    const createGroundPatch = (patchKey: PatchKey) => {
      const groundLayer = GroundPatch.fromKey(patchKey, patchDim)
      groundLayer.prepare(worldModules.biome)
      return groundLayer
    }

    const getGroundPatch = (requestedPos: Vector2) => {
      const patchKey = getPatchKey(requestedPos)
      // look for existing patch in current cache
      const groundPatch = buildCache[patchKey]
      // if not existing build and insert in cache
      return groundPatch || createGroundPatch(patchKey)
    }

    const parseBlocksInput = (blocksInput: BlocksProcessingInput) => {
      if (dataFormat && dataFormat === BlocksDataFormat.XZ_FloatArray) {
        const count = blocksInput.length / 2
        const parsed = []
        for (let i = 0; i < count; i++) {
          const x = blocksInput[2 * i + 0] as number
          const z = blocksInput[2 * i + 1] as number
          const v = new Vector3(x, 0, z)
          parsed.push(v)
        }
        return parsed
      } else {
        const parsedInput = processingContext === ProcessingContext.Worker
          ? (parseTaskInputStubs(...processingInput) as BlocksProcessingInput)
          : processingInput
        return parsedInput as Vector3[]
      }
    }

    const formatOutputData = (blocksData: Block<BlockData>[]) => {
      if (dataFormat && dataFormat === BlocksDataFormat.XZ_FloatArray) {
        const elevation = new Float32Array(blocksData.map(blockData => blockData.data.level))
        const type = new Float32Array(blocksData.map(blockData => blockData.data.type))
        const outputData = {
          elevation,
          type
        }
        return outputData
      }
      return blocksData
    }

    // const getBuildDeps = (recipe: BlocksProcessingRecipe) => {
    // }

    const bakeBlock = (blockPos: Vector3) => {
      const groundPatch = getGroundPatch(asVect2(blockPos))
      const groundBlock = bakeGroundBlock(
        blockPos.clone(),
        groundPatch,
        includeDensity,
      )
      if (recipe === BlocksProcessingRecipe.Ground) return groundBlock
      else if (recipe === BlocksProcessingRecipe.Peak) {
        // build deps
        const peakBlock = bakePeakBlock(groundBlock)
        return peakBlock
      } else if (recipe === BlocksProcessingRecipe.Floor) {
        const initialBlockLevel = blockPos.y // Math.round(groundBlock.pos.y / 2)  // groundBlock.data.level + 1
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

    /**
     * requires: ground patch
     * provides: ground block
     */
    const bakeGroundBlock = (
      pos: Vector3,
      groundPatch: GroundPatch,
      includeDensity = false,
    ) => {
      const groundData = groundPatch?.computeGroundBlock(pos, worldModules)
      // return groundData
      // }).filter(val => val) as GroundBlockData[]
      // const batchOutput = groundBlocksData.map(groundData => {
      const { biome, landIndex, level } = groundData as GroundBlockData
      const landscapeConf = worldModules.biome.mappings[biome].nth(landIndex)
      const groundConf = landscapeConf.data
      // check for block emptyness if specified
      const isEmptyBlock = () =>
        worldModules.densityVolume.getBlockDensity(pos, level + 20)
      const blockData: BlockData = {
        level,
        type: includeDensity && isEmptyBlock() ? BlockType.HOLE : groundConf.type,
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
      const itemsTaskHandler = taskHandlers[itemsProcessingHandlerName]
      const peakBlock = (await ItemsProcessing.pointPeakBlock(
        asVect2(groundBlock.pos),
      ).process(itemsTaskHandler as any)) as any
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
        worldModules.densityVolume.getBlockDensity(
          asVect3(groundPos, level),
          groundLevel + 20,
        )

      const isAboveSurface = initialBlockLevel > groundLevel

      let currentLevel = initialBlockLevel
      if (isAboveSurface) {
        // above ground level => start from ground level
        currentLevel = groundLevel
      } else {
        // below ground level =>  find first empty block below
        while (!isEmptyBlock(currentLevel) && currentLevel-- >= 0);
      }
      // then look for last empty block below
      while (isEmptyBlock(currentLevel) && currentLevel-- >= 0);
      // currentLevel = 128
      groundBlock.pos.y = currentLevel
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

    const parsedInput = parseBlocksInput(processingInput)
    const blocksData = parsedInput?.map(requestedPos => bakeBlock(requestedPos))
    // const blockData: Block<BlockData> = {
    //   pos: new Vector3,
    //   data: {
    //     level: 0,
    //     type: BlockType.SAND,
    //   }
    // }
    // const blocksProcessing = parsedInput?.map(requestedPos => blockData)

    return isAsync && blocksData ?
      Promise.all(blocksData).then(blocksData => formatOutputData(blocksData))
      : formatOutputData(blocksData)
  }
  return blocksTaskHandler
}

// const res = await BlocksProcessing.getFloorPositions([]).delegate()

/**
 * Processing
 */

// or build artefacts
// type BuildData = {
//   groundPatch: GroundPatch
//   groundBlock?: Block<BlockData>
//   overgroundBlocks?: number[]
//   undergroundBlocks?: number[]
// }
