import { Vector2, Vector3 } from 'three'

import {
  serializePatchId,
  getPatchId,
  asVect3,
  asVect2,
  // parseThreeStub,
} from '../utils/patch_chunk.js'
import { PatchKey, Block, BlockData, BlockType, BlockRawData } from '../utils/common_types.js'
import { WorldModules } from '../WorldModules.js'

import { GroundBlockData, GroundPatch } from './GroundPatch.js'
import {
  parseTaskInputStubs,
  ProcessingContext,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'
import { ItemsTask } from './ItemsProcessing.js'
import { BiomeType } from '../procgen/Biome.js'

/**
 * Calling side
 */

export enum BlocksTaskRecipe {
  RawData,
  Ground,
  Overground,
  Underground,
  Peak,
  Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
  Ceiling,
  Nearest, // nearest ground, floor or ceiling
}

export enum BlocksDataFormat {
  VectorArrayXYZ,
  FloatArrayXZ,
}

type FloatArrayOut = {
  elevation: Float32Array,
  type: Float32Array
}

export type BlocksTaskInput = Vector3[] | Float32Array
export type BlocksTaskOutput = Block<BlockData>[] | FloatArrayOut
export type BlocksTaskParams = {
  recipe: BlocksTaskRecipe
  includeDensity?: boolean
  dataFormat?: BlocksDataFormat
  peaksAccuracy?: number
}

const initTask = (recipe: BlocksTaskRecipe) => {

}

// const postProcessTaskResults = (rawOutputData: BlocksTaskOutput) => {
//   return rawOutputData.map(blockStub => {
//     blockStub.pos = parseThreeStub(blockStub.pos)
//     // return WorldUtils.convert.parseThreeStub(pos)
//     return blockStub
//   }) //as GroundBlock[]
// }

export class BlocksTask extends ProcessingTask<
  BlocksTaskInput,
  BlocksTaskParams,
  BlocksTaskOutput
> {
  static handlerId = 'BlocksProcessing'

  /**
   * Direct access to most common tasks, for further customization, adjust processing params
   */

  factory(recipe: BlocksTaskRecipe) {
    this.handlerId = BlocksTask.handlerId
    this.processingParams = { recipe }
    return (input: BlocksTaskInput) => {
      this.processingInput = input
      return this
    }
  }

  get rawData() {
    return this.factory(BlocksTaskRecipe.RawData)
  }

  get groundPositions() {
    return this.factory(BlocksTaskRecipe.Ground)
  }

  get peakPositions() {
    return this.factory(BlocksTaskRecipe.Peak)
  }

  get floorPositions() {
    return this.factory(BlocksTaskRecipe.Floor)
  }

  get ceilPositions() {
    return this.factory(BlocksTaskRecipe.Ceiling)
  }

  /**
   * Static versions kept for backward compat with previous API but could be removed
   */

  static factory = (recipe: BlocksTaskRecipe) => (input: BlocksTaskInput) => {
    const task = new BlocksTask()
    task.handlerId = BlocksTask.handlerId
    task.processingInput = input
    task.processingParams = { recipe }
    return task
  }

  static get groundPositions() {
    return this.factory(BlocksTaskRecipe.Ground)
  }

  static get peakPositions() {
    return this.factory(BlocksTaskRecipe.Peak)
  }

  static get floorPositions() {
    return this.factory(BlocksTaskRecipe.Floor)
  }

  static get ceilPositions() {
    return this.factory(BlocksTaskRecipe.Ceiling)
  }
}

// kept for backward compatibility with previous API (TODO: remove)
export const BlocksProcessing = BlocksTask

/**
 * Handling side
 */

type BlocksTaskStub = ProcessingTaskStub<BlocksTaskInput, BlocksTaskParams>
type BlocksProcessingTaskHandler = ProcessingTaskHandler<
  BlocksTaskInput,
  BlocksTaskParams,
  any
>

// const floorPositionsHandler = (input: Vector3[]) => {

// }

// const BlocksProcessingTaskHandlers = {
//   floorPositionsHandler
// }

abstract class BlocksDataIOAdapter<BlocksOutputType> {
  patchDimensions: Vector2
  abstract inputData: Vector3[]
  indexBatches: Record<PatchKey, number[]>
  abstract outputData: BlocksOutputType

  constructor(patchDimensions: Vector2) {
    this.patchDimensions = patchDimensions
    this.indexBatches = {}
  }

  get batchKeys() {
    return Object.keys(this.indexBatches)
  }

  *iterBatchData(patchKey: PatchKey) {
    const batchIndices = this.indexBatches[patchKey] || []
    for (const index of batchIndices) {
      const data = this.inputData[index]
      if (data) yield { data, index }
    }
  }

  *iterBatchIndices(batchIndices: number[]) {
    for (const index of batchIndices) {
      const data = this.inputData[index]
      yield data
    }
  }

  splitIntoIndexBatches() {
    const { indexBatches } = this
    // sort indices from batch into patch
    this.inputData.forEach((pos, index) => {
      const patchId = getPatchId(asVect2(pos), this.patchDimensions)
      const patchKey = serializePatchId(patchId)
      indexBatches[patchKey] = indexBatches[patchKey] || []
      indexBatches[patchKey].push(index)
    })
  }
  // iterInputData: ()=> Vector3
  // readData: (batchIndex: number) => Vector3
  abstract writeData(batchIndex: number, blockData: Block<BlockData>): void
}

type BatchIterator = Generator<IteratedBlock<Vector3>, void, unknown>

type IteratedBlock<T> = {
  data: T;
  index: number;
}

class VectorArrayIOAdapter extends BlocksDataIOAdapter<Block<BlockData>[]> {
  inputData: Vector3[]
  outputData: Block<BlockData>[]
  isStubData: boolean
  constructor(patchDimensions: Vector2, rawInputData: Vector3[], isStubData = false) {
    super(patchDimensions)
    this.inputData = isStubData ? parseTaskInputStubs(...rawInputData) : rawInputData
    this.isStubData = isStubData
    this.outputData = []
    this.splitIntoIndexBatches()
  }

  // iterInputData(){

  // }

  // readData(batchIndex: number) {
  //   const rawData = this.inputData[batchIndex] as Vector3
  //   const data = this.isStubData ? parseThreeStub(rawData) : rawData
  //   return data
  // }

  writeData(batchIndex: number, blockData: Block<BlockData>) {
    this.outputData.push(blockData)
  }

}

const parseFloat32Data = (inputData: Float32Array) => {
  const count = inputData.length / 2
  const data = []
  for (let i = 0; i < count; i++) {
    const x = inputData[2 * i + 0] as number
    const z = inputData[2 * i + 1] as number
    const v = new Vector3(x, 0, z)
    data.push(v)
  }
  return data
}

class FloatArrayIOAdapter extends BlocksDataIOAdapter<FloatArrayOut> {
  inputData: Vector3[]
  outputData: FloatArrayOut

  constructor(patchDimensions: Vector2, rawInputData: Float32Array) {
    super(patchDimensions)
    this.inputData = parseFloat32Data(rawInputData)
    this.outputData = {
      elevation: new Float32Array(this.inputData.length),
      type: new Float32Array(this.inputData.length)
    }
    this.splitIntoIndexBatches()
  }

  // iterInputData(){
  //   const count = this.inputData.length / 2
  //       for (let i = 0; i < count; i++) {
  //         const x = blocksInput[2 * i + 0] as number
  //         const z = blocksInput[2 * i + 1] as number
  //         const v = new Vector3(x, 0, z)
  //         parsed.push(v)
  //       }
  // }

  // readData(batchIndex: number) {
  //   const x = this.inputData[2 * batchIndex] as number
  //   const z = this.inputData[2 * batchIndex + 1] as number
  //   const v = new Vector3(x, 0, z)
  //   return v
  // }

  writeData(batchIndex: number, block: Block<BlockData>) {
    this.outputData.elevation[batchIndex] = block.data.level
    this.outputData.type[batchIndex] = block.data.type
  }

}

export const createBlocksTaskHandler = (
  worldModules: WorldModules,
  processingContext = ProcessingContext.None,
) => {
  const { worldLocalEnv, taskHandlers } = worldModules
  const blocksTaskHandler: BlocksProcessingTaskHandler = (
    taskStub: BlocksTask | BlocksTaskStub,
  ) => {
    const patchDim = worldLocalEnv.getPatchDimensions()
    const { processingInput, processingParams } = taskStub
    const { recipe, includeDensity, dataFormat } = processingParams

    const isAsync = recipe === BlocksTaskRecipe.Peak

    const batchProcessingIterator = (ioDataAdapter: BlocksDataIOAdapter<any>, patchKey: PatchKey) => {
      const batchIterator = ioDataAdapter.iterBatchData(patchKey)
      const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
      groundLayer.prepare(worldModules.biomes)

      switch (recipe) {
        case BlocksTaskRecipe.RawData:
          return iterRawBlocks(batchIterator, patchKey)
        case BlocksTaskRecipe.Ground:
          return iterGroundBlocks(batchIterator, patchKey)
        case BlocksTaskRecipe.Peak:
          return iterPeakBlocks(batchIterator, patchKey)
        case BlocksTaskRecipe.Floor:
          return iterFloorBlocks(batchIterator, patchKey)
        case BlocksTaskRecipe.Ceiling:
          return iterCeilingBlocks(batchIterator, patchKey)
        default:
          return iterGroundBlocks(batchIterator, patchKey)
      }
    }

    function* iterRawBlocks(batchIterator: BatchIterator, patchKey: PatchKey) {
      const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
      groundLayer.prepare(worldModules.biomes)
      let batchCount = 0
      for (const { data: pos, index } of batchIterator) {
        const groundData = groundLayer.computeGroundBlock(pos, worldModules)
        // return groundData
        // }).filter(val => val) as GroundBlockData[]
        // const batchOutput = groundBlocksData.map(groundData => {
        const { biome, landIndex, level } = groundData as GroundBlockData
        const data: BlockRawData = {
          biome,
          landIndex,
          level
        }
        const block: IteratedBlock<Block<BlockRawData>> = {
          // pos,
          data: { pos, data },
          index
        }
        batchCount++
        yield block
      }
      // console.log(`patch: ${patchKey} batch size: ${batchCount}`)
    }

    function* iterGroundBlocks(batchIterator: BatchIterator, patchKey: PatchKey) {
      for (const rawBlock of iterRawBlocks(batchIterator, patchKey)) {

        const { level, biome, landIndex } = rawBlock.data.data
        const landscapeConf = worldModules.biomes.mappings[biome].nth(landIndex)
        const groundConf = landscapeConf.data
        // check for block emptyness if specified
        const isEmptyBlock = () =>
          worldModules.densityVolume.getBlockDensity(rawBlock.data.pos, level + 20)
        const blockData: BlockData = {
          level,
          type:
            includeDensity && isEmptyBlock() ? BlockType.HOLE : groundConf.type,
        }
        const data = {
          pos: rawBlock.data.pos,
          data: blockData
        }
        const groundBlock: IteratedBlock<Block<BlockData>> = {
          // pos,
          data,
          index: rawBlock.index
        }
        yield groundBlock
      }
      // console.log(`patch: ${patchKey} batch size: ${batchCount}`)
    }

    async function* iterPeakBlocks(batchIterator: BatchIterator, patchKey: PatchKey) {
      // const itemsTaskHandler = taskHandlers[ItemsTask.handlerId]

      for await (const groundBlock of iterGroundBlocks(batchIterator, patchKey)) {
        // const itemPeakTask = new ItemsTask()
        // itemPeakTask.pointPeakBlock(asVect2(groundBlock.pos))
        // if (itemsTaskHandler) {
        //   const itemPeakBlock: any = await itemPeakTask.process(itemsTaskHandler)
        //   if (itemPeakBlock.type !== BlockType.NONE) {
        //     groundBlock.data.level = itemPeakBlock.level
        //     groundBlock.data.type = itemPeakBlock.type
        //   }
        //   yield groundBlock
        // }
        yield groundBlock
      }
    }

    /**
    * to avoid spawning above schematics like trees returned block should not be
    * above schematic block or not at greater distance from ground surface
    * usage: random spawn above floor surface
    *
    */

    /**
     * start with normal query to find ground level,
     * - if requested pos is above ground: returns ground pos provided there is no
     * schematic blocks at given location or schematics blocks are lesser than predefined value
     * - if requested pos is below ground: look down or up for closest empty block
     * stop iterating in up direction if reaching ground surface with schematic block
     * offset from requested pos
     * 
     * @param groundBlock 
     * @param initialBlockLevel 
     */

    function* iterFloorBlocks(batchIterator: BatchIterator, patchKey: PatchKey) {
      for (const iteratedBlock of iterGroundBlocks(batchIterator, patchKey)) {
        const groundBlock = iteratedBlock.data
        const initialBlockLevel = groundBlock.pos.y
        const groundLevel = groundBlock.data.level
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
        yield groundBlock
      }
    }

    function* iterCeilingBlocks(batchIterator: BatchIterator, patchKey: PatchKey) {
      for (const groundBlock of iterGroundBlocks(batchIterator, patchKey)) {
        yield groundBlock
      }
    }

    const isStubData = dataFormat === BlocksDataFormat.FloatArrayXZ && processingContext === ProcessingContext.Worker
    const ioDataAdapter = dataFormat === BlocksDataFormat.FloatArrayXZ ?
      new FloatArrayIOAdapter(patchDim, processingInput as Float32Array)
      : new VectorArrayIOAdapter(patchDim, processingInput as Vector3[], isStubData)

    const batchesRes = ioDataAdapter.batchKeys.map(async patchKey => {
      const batchProcess = batchProcessingIterator(ioDataAdapter, patchKey)
      if (batchProcess) {
        for await (const block of batchProcess) {
          ioDataAdapter.writeData(block.index, block.data)
        }
      }
    })

    // const blockData: Block<BlockData> = {
    //   pos: new Vector3,
    //   data: {
    //     level: 0,
    //     type: BlockType.SAND,
    //   }
    // }
    // const blocksProcessing = parsedInput?.map(requestedPos => blockData)

    return isAsync
      ? Promise.all(batchesRes).then(() => ioDataAdapter.outputData)
      : ioDataAdapter.outputData
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
