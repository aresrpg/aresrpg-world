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
  BaseProcessingParams,
  parseTaskInputStubs,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'
import { ItemsTask } from './ItemsProcessing.js'

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

export type BlocksTaskInput = Vector3[] | Vector2[] | Float32Array
export type BlocksTaskOutput = Block<BlockData>[] | FloatArrayOut
export type BlocksTaskParams = BaseProcessingParams & {
  recipe: BlocksTaskRecipe
  includeDensity?: boolean
  dataFormat?: BlocksDataFormat
  peaksAccuracy?: number
}

// const postProcessTaskResults = (rawOutputData: BlocksTaskOutput) => {
//   return rawOutputData.map(blockStub => {
//     blockStub.pos = parseThreeStub(blockStub.pos)
//     // return WorldUtils.convert.parseThreeStub(pos)
//     return blockStub
//   }) //as GroundBlock[]
// }

export class BlocksTask<ProcessingInput extends BlocksTaskInput, ProcessingOutput extends BlocksTaskOutput> extends ProcessingTask<
  ProcessingInput,
  BlocksTaskParams,
  ProcessingOutput
> {
  static handlerId = 'BlocksProcessing'

  constructor() {
    super(BlocksTask.handlerId)
  }

  /**
   * Build templates for most common tasks, adjust manually if needed
   */

  /**
   * Instance version (allow use from child classes)
   * @param recipe 
   * @returns 
   */

  getBuildTemplate(recipe: BlocksTaskRecipe) {
    this.processingParams = { recipe }
    return (input: ProcessingInput) => {
      this.processingInput = input
      return this
    }
  }

  get rawData() {
    return this.getBuildTemplate(BlocksTaskRecipe.RawData)
  }

  get groundPositions() {
    return this.getBuildTemplate(BlocksTaskRecipe.Ground)
  }

  get peakPositions() {
    return this.getBuildTemplate(BlocksTaskRecipe.Peak)
  }

  get floorPositions() {
    return this.getBuildTemplate(BlocksTaskRecipe.Floor)
  }

  get ceilPositions() {
    return this.getBuildTemplate(BlocksTaskRecipe.Ceiling)
  }

  /**
   * Static versions (allow better types inferance)
   * @param recipe 
   * @returns 
   */

  static factory = <ProcessingInput extends BlocksTaskInput, ProcessingOutput extends BlocksTaskOutput>(recipe: BlocksTaskRecipe) => (input: ProcessingInput) => {
    const task = new BlocksTask<ProcessingInput, ProcessingOutput>()
    task.handlerId = BlocksTask.handlerId
    task.processingInput = input
    task.processingParams = { recipe }
    return task
  }

  static get groundPositions() {
    return this.factory<BlocksTaskInput, Block<BlockData>[]>(BlocksTaskRecipe.Ground)
  }

  static get peakPositions() {
    return this.factory<BlocksTaskInput, Block<BlockData>[]>(BlocksTaskRecipe.Peak)
  }

  static get floorPositions() {
    return this.factory<BlocksTaskInput, Block<BlockData>[]>(BlocksTaskRecipe.Floor)
  }

  static get ceilPositions() {
    return this.factory<BlocksTaskInput, Block<BlockData>[]>(BlocksTaskRecipe.Ceiling)
  }
}

// kept for backward compatibility with previous API (TODO: remove)
export const BlocksProcessing = BlocksTask

/**
 * Handling side
 */

type BlocksTaskStub = ProcessingTaskStub<BlocksTaskInput, BlocksTaskParams>
export type BlocksProcessingHandler = ProcessingTaskHandler<
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
  abstract outputData: BlocksOutputType

  constructor(patchDimensions: Vector2) {
    this.patchDimensions = patchDimensions
  }

  *iterBatchData(batchIndices: number[]) {
    for (const index of batchIndices) {
      const data = this.inputData[index]
      if (data) yield { data, index }
    }
  }

  splitIntoBatches() {
    const batches: Record<PatchKey, number[]> = {}
    // sort indices from batch into patch
    this.inputData.forEach((pos, index) => {
      const patchId = getPatchId(asVect2(pos), this.patchDimensions)
      const patchKey = serializePatchId(patchId)
      batches[patchKey] = batches[patchKey] || []
      batches[patchKey].push(index)
    })
    return batches
  }
  // iterInputData: ()=> Vector3
  // readData: (batchIndex: number) => Vector3
  abstract writeData(batchIndex: number, blockData: Block<BlockData>): void
}

type InputBatchIterator = Generator<IteratedBlock<Vector3>, void, unknown>

type IteratedBlock<T> = {
  data: T;
  index: number;
}

class VectorArrayIOAdapter extends BlocksDataIOAdapter<Record<number, Block<BlockData>>> {
  inputData: Vector3[]
  outputData: Record<number, Block<BlockData>>
  isStubData: boolean
  constructor(patchDimensions: Vector2, rawInputData: Vector3[], isStubData = false) {
    super(patchDimensions)
    this.inputData = isStubData ? parseTaskInputStubs(...rawInputData) : rawInputData
    this.isStubData = isStubData
    this.outputData = {}
  }

  // iterInputData(){

  // }

  // readData(batchIndex: number) {
  //   const rawData = this.inputData[batchIndex] as Vector3
  //   const data = this.isStubData ? parseThreeStub(rawData) : rawData
  //   return data
  // }

  writeData(inputIndex: number, blockData: Block<BlockData>) {
    this.outputData[inputIndex] = blockData
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

  writeData(inputIndex: number, block: Block<BlockData>) {
    this.outputData.elevation[inputIndex] = block.data.level
    this.outputData.type[inputIndex] = block.data.type
  }

}

// For testing purpose, will be moved to processing params or removed
const SPLIT_SPAWNED_ITEMS_REQUEST = false

export const createBlocksTaskHandler = (worldModules: WorldModules) => {
  const { worldLocalEnv, taskHandlers } = worldModules
  const blocksTaskHandler: BlocksProcessingHandler = (taskStub: BlocksTaskStub) => {
    const patchDim = worldLocalEnv.getPatchDimensions()
    const { processingInput, processingParams } = taskStub
    const { recipe, includeDensity, dataFormat } = processingParams

    const batchProcessingIterator = (inputBatchIterator: InputBatchIterator, patchKey: PatchKey) => {
      const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
      groundLayer.prepare(worldModules.biomes)

      switch (recipe) {
        case BlocksTaskRecipe.RawData:
          return iterRawBlocks(inputBatchIterator, patchKey)
        case BlocksTaskRecipe.Ground:
          return iterGroundBlocks(inputBatchIterator, patchKey)
        case BlocksTaskRecipe.Peak:
          return iterPeakBlocks(inputBatchIterator, patchKey)
        case BlocksTaskRecipe.Floor:
          return iterFloorBlocks(inputBatchIterator, patchKey)
        case BlocksTaskRecipe.Ceiling:
          return iterCeilingBlocks(inputBatchIterator, patchKey)
        default:
          return iterGroundBlocks(inputBatchIterator, patchKey)
      }
    }

    function* iterRawBlocks(inputBatchIterator: InputBatchIterator, patchKey: PatchKey) {
      const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
      groundLayer.prepare(worldModules.biomes)
      let batchCount = 0
      for (const { data: pos, index } of inputBatchIterator) {
        const groundData = groundLayer.computeGroundBlock(pos, worldModules)
        // return groundData
        // }).filter(val => val) as GroundBlockData[]
        // const batchOutput = groundBlocksData.map(groundData => {
        const { biome, landIndex, level } = groundData as GroundBlockData
        const blockData: BlockRawData = {
          biome,
          landIndex,
          level
        }
        const data = {
          pos,
          data: blockData
        }
        const block: IteratedBlock<Block<BlockRawData>> = {
          // pos,
          data,
          index
        }
        batchCount++
        yield block
      }
      // console.log(`patch: ${patchKey} batch size: ${batchCount}`)
    }

    function* iterGroundBlocks(inputBatchIterator: InputBatchIterator, patchKey: PatchKey) {
      for (const rawBlock of iterRawBlocks(inputBatchIterator, patchKey)) {

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

    function* iterPeakBlocks(inputBatchIterator: InputBatchIterator, patchKey: PatchKey) {
      // console.log(itemsTaskHandler)
      for (const groundBlock of iterGroundBlocks(inputBatchIterator, patchKey)) {
        // const mergedChunkTask = new ItemsTask()
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

    function* iterFloorBlocks(inputBatchIterator: InputBatchIterator, patchKey: PatchKey) {
      for (const iteratedBlock of iterGroundBlocks(inputBatchIterator, patchKey)) {
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

    function* iterCeilingBlocks(inputBatchIterator: InputBatchIterator, patchKey: PatchKey) {
      for (const groundBlock of iterGroundBlocks(inputBatchIterator, patchKey)) {
        yield groundBlock
      }
    }

    const isStubData = dataFormat === BlocksDataFormat.FloatArrayXZ && processingParams.isDelegated
    const ioDataAdapter = dataFormat === BlocksDataFormat.FloatArrayXZ ?
      new FloatArrayIOAdapter(patchDim, processingInput as Float32Array)
      : new VectorArrayIOAdapter(patchDim, processingInput as Vector3[], isStubData)


    const itemsChunksProvider = (inputBatch: Vector3[]) => {
      const taskInput = inputBatch.map(input => asVect2(input))
      const itemsTask = ItemsTask.individualChunks(taskInput) //new ItemsTask().individualChunks(taskInput)
      itemsTask.processingParams.useLighterProcessing = true
      const itemsRes = itemsTask.process(taskHandlers)
      // console.log(`items count for : ${itemsRes.length} `)
      return itemsRes || []
    }

    let spawnedChunks = !SPLIT_SPAWNED_ITEMS_REQUEST && recipe === BlocksTaskRecipe.Peak ? itemsChunksProvider(ioDataAdapter.inputData) : []
    const inputBatches = ioDataAdapter.splitIntoBatches()
    // const pendingBatches = Object.entries(inputBatches).map(async ([patchKey, batchIndices]) => {
    for (const [patchKey, batchIndices] of Object.entries(inputBatches)) {
      if (SPLIT_SPAWNED_ITEMS_REQUEST && recipe === BlocksTaskRecipe.Peak) {
        const batchInput: Vector3[] = []
        ioDataAdapter.iterBatchData(batchIndices).forEach(({ data }) => batchInput.push(data))
        spawnedChunks = itemsChunksProvider(batchInput)
        // console.log(`items count for ${patchKey}: ${itemsRes.length} `)
      }
      const inputBatchIterator: InputBatchIterator = ioDataAdapter.iterBatchData(batchIndices)
      for (const block of batchProcessingIterator(inputBatchIterator, patchKey)) {
        if (block.data) {
          const blockLevel = block.data.data.level
          const blockPos = block.data.pos.floor()
          blockPos.y = blockLevel + 2
          const itemChunk = spawnedChunks.find(chunk => chunk.bounds.containsPoint(blockPos))
          const upperBlock = itemChunk?.getUpperBlock(blockPos)
          if (upperBlock) {
            block.data.data.level = upperBlock.level
            block.data.data.type = upperBlock.type
          }
          ioDataAdapter.writeData(block.index, block.data)
        }
      }
    }

    // const blockData: Block<BlockData> = {
    //   pos: new Vector3,
    //   data: {
    //     level: 0,
    //     type: BlockType.SAND,
    //   }
    // }
    // const blocksProcessing = parsedInput?.map(requestedPos => blockData)

    return ioDataAdapter.outputData
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
