import { Vector2, Vector3 } from 'three'

import {
    serializePatchId,
    getPatchId,
    asVect3,
    asVect2,
    asBox2,
    parseThreeStub,
    // parseThreeStub,
} from '../utils/patch_chunk.js'
import { PatchKey, BlockData, BlockType, BlockRawData, GroundBlockData, PatchDataCell } from '../utils/common_types.js'
import { WorldModules } from '../factory/WorldModules.js'
import { SpawnChunk } from '../factory/ChunksFactory.js'

import { GroundPatch } from './GroundPatch.js'
import { BaseProcessingParams, ProcessingTask, ProcessingTaskHandler, ProcessingTaskStub } from './TaskProcessing.js'
import { ItemsTask } from './ItemsProcessing.js'

/**
 * Calling side
 */

export enum BlocksTaskRecipe {
    Ground,
    Peak,
    Floor, // returns floor if requested block is empty in down direction, otherwise look for closest floor in up direction
    Ceiling,
    // Nearest, // nearest ground, floor or ceiling
}

export enum BlocksDataFormat {
    VectorArrayXYZ = 'vector_array_xyz',
    FloatArrayXZ = 'float_array_xz',
}

export type FloatArrayOut = {
    elevation: Float32Array
    type: Float32Array
}

export type BlocksTaskInput = Vector3[] | Vector2[] | Float32Array
export type BlocksTaskOutput = PatchDataCell<BlockData>[] | FloatArrayOut
export type BlocksTaskParams = BaseProcessingParams & {
    recipe: BlocksTaskRecipe
    includeDensity?: boolean
    dataFormat?: BlocksDataFormat
    includeRawData?: boolean
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
        this.processingParams.recipe = recipe
        return (input: ProcessingInput) => {
            this.processingInput = input
            return this
        }
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

    static factory =
        <ProcessingInput extends BlocksTaskInput, ProcessingOutput extends BlocksTaskOutput>(recipe: BlocksTaskRecipe) =>
        (input: ProcessingInput) => {
            const task = new BlocksTask<ProcessingInput, ProcessingOutput>()
            task.handlerId = BlocksTask.handlerId
            task.processingInput = input
            task.processingParams = { recipe }
            return task
        }

    static get groundPositions() {
        return this.factory<BlocksTaskInput, BlocksTaskOutput>(BlocksTaskRecipe.Ground)
    }

    static get peakPositions() {
        return this.factory<BlocksTaskInput, BlocksTaskOutput>(BlocksTaskRecipe.Peak)
    }

    static get floorPositions() {
        return this.factory<BlocksTaskInput, BlocksTaskOutput>(BlocksTaskRecipe.Floor)
    }

    static get ceilPositions() {
        return this.factory<BlocksTaskInput, BlocksTaskOutput>(BlocksTaskRecipe.Ceiling)
    }
}

// kept for backward compatibility with previous API (TODO: remove)
export const BlocksProcessing = BlocksTask

/**
 * Handling side
 */

type BlocksTaskStub = ProcessingTaskStub<BlocksTaskInput, BlocksTaskParams>
export type BlocksProcessingHandler = ProcessingTaskHandler<BlocksTaskInput, BlocksTaskParams, any>

// const floorPositionsHandler = (input: Vector3[]) => {

// }

// const BlocksProcessingTaskHandlers = {
//   floorPositionsHandler
// }

abstract class BlocksDataIOAdapter<BlocksOutputType> {
    patchDimensions: Vector2
    abstract inputData: PatchDataCell<any>[]
    abstract outputData: any

    constructor(patchDimensions: Vector2) {
        this.patchDimensions = patchDimensions
    }

    // abstract parseInput():any
    abstract formatOutput(): BlocksOutputType

    *iterBatchData(batchIndices: number[]) {
        for (const index of batchIndices) {
            const inputData = this.inputData[index]
            if (inputData) {
                const { pos, data } = inputData
                yield { index, pos, data }
            }
        }
    }

    splitIntoBatches() {
        const batches: Record<PatchKey, number[]> = {}
        // sort indices from batch into patch
        this.inputData.forEach(({ pos }, index) => {
            const patchId = getPatchId(pos, this.patchDimensions)
            const patchKey = serializePatchId(patchId)
            batches[patchKey] = batches[patchKey] || []
            batches[patchKey].push(index)
        })
        return batches
    }

    asInputPosArray() {
        return this.inputData.map(({ pos }) => pos)
    }

    // iterInputData: ()=> Vector3
    // readData: (batchIndex: number) => Vector3
    abstract writeData(batchIndex: number, blockData: PatchDataCell<BlockData>): void
}

type BatchDataIteration<T> = PatchDataCell<T> & { index: number }
type BatchDataIterator<T> = Generator<BatchDataIteration<T>, void, unknown>
type MergedBlockData<T> = BlockData & T

class Vector2ArrayIOAdapter extends BlocksDataIOAdapter<PatchDataCell<BlockData>[]> {
    inputData: PatchDataCell<any>[]
    outputData: Record<number, PatchDataCell<BlockData>>
    isStubData: boolean
    constructor(patchDimensions: Vector2, rawInputData: Vector2[], isStubData = false) {
        super(patchDimensions)
        this.inputData = rawInputData.map(pos => (isStubData ? parseThreeStub(pos) : pos)).map(pos => ({ pos, data: null }))
        this.isStubData = isStubData
        this.outputData = {}
    }

    formatOutput() {
        return Object.values(this.outputData)
    }

    // iterInputData(){

    // }

    // readData(batchIndex: number) {
    //   const rawData = this.inputData[batchIndex] as Vector3
    //   const data = this.isStubData ? parseThreeStub(rawData) : rawData
    //   return data
    // }

    writeData(inputIndex: number, blockData: PatchDataCell<BlockData>) {
        this.outputData[inputIndex] = blockData
    }
}

class Vector3ArrayIOAdapter extends BlocksDataIOAdapter<PatchDataCell<BlockData>[]> {
    override inputData: PatchDataCell<{ elevation: number }>[]
    override outputData: any
    constructor(patchDimensions: Vector2, rawInputData: Vector3[]) {
        super(patchDimensions)
        this.inputData = rawInputData.map(blockPos => {
            const pos = asVect2(blockPos)
            const dataCell: PatchDataCell<{ elevation: number }> = {
                pos,
                data: {
                    elevation: blockPos.y,
                },
            }
            return dataCell
        })
    }

    override formatOutput(): PatchDataCell<BlockData>[] {
        throw new Error('Method not implemented.')
    }

    override writeData(inputIndex: number, blockData: PatchDataCell<BlockData>): void {
        this.outputData[inputIndex] = blockData
    }
}

const parseFloat32Data = (inputData: Float32Array) => {
    const count = inputData.length / 2
    const data = []
    for (let i = 0; i < count; i++) {
        const x = inputData[2 * i + 0] as number
        const y = inputData[2 * i + 1] as number
        const v = new Vector2(x, y)
        data.push(v)
    }
    return data
}

class FloatArrayIOAdapter extends BlocksDataIOAdapter<FloatArrayOut> {
    inputData: PatchDataCell<null>[]
    outputData: FloatArrayOut

    constructor(patchDimensions: Vector2, rawInputData: Float32Array) {
        super(patchDimensions)
        this.inputData = parseFloat32Data(rawInputData).map(pos => ({ pos, data: null }))
        this.outputData = {
            elevation: new Float32Array(this.inputData.length),
            type: new Float32Array(this.inputData.length),
        }
    }

    formatOutput() {
        return this.outputData
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

    writeData(inputIndex: number, block: PatchDataCell<BlockData>) {
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
        const { recipe, includeDensity, dataFormat, includeRawData } = processingParams

        const batchProcessingIterator = (inputBatchIterator: BatchDataIterator<any>, patchKey: PatchKey) => {
            const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
            groundLayer.prepare(worldModules.biomes)

            switch (recipe) {
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

        function* iterGroundBlocks(inputBatchIterator: BatchDataIterator<any>, patchKey: PatchKey) {
            const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
            groundLayer.prepare(worldModules.biomes)
            for (const { pos, index, data } of inputBatchIterator) {
                const groundData = groundLayer.computeGroundBlock(pos, worldModules)
                // return groundData
                // }).filter(val => val) as GroundBlockData[]
                // const batchOutput = groundBlocksData.map(groundData => {
                const { biome, landIndex, level } = groundData as GroundBlockData
                const blockRawData: Partial<BlockRawData> = includeRawData
                    ? {
                          biome,
                          landIndex,
                          level,
                      }
                    : {}
                const landConf = worldModules.ground.biomes[biome].nth(landIndex)
                const groundConf = landConf.data
                // check for block emptyness if specified
                const isEmptyBlock = () => worldModules.cavesDensity.getBlockDensity(asVect3(pos, level), level + 20)

                const type = includeDensity && isEmptyBlock() ? BlockType.HOLE : groundConf.type
                const blockData: MergedBlockData<any> = {
                    ...blockRawData,
                    level,
                    type,
                    ...data,
                }

                const groundBlock: BatchDataIteration<MergedBlockData<any>> = {
                    pos,
                    data: blockData,
                    index,
                }
                yield groundBlock
            }
            // console.log(`patch: ${patchKey} batch size: ${batchCount}`)
        }

        function* iterPeakBlocks(inputBatchIterator: BatchDataIterator<any>, patchKey: PatchKey) {
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

        function* iterFloorBlocks(inputBatchIterator: BatchDataIterator<{ elevation: number }>, patchKey: PatchKey) {
            for (const iteratedBlock of iterGroundBlocks(inputBatchIterator, patchKey)) {
                const blockPos = iteratedBlock.pos
                const blockData = iteratedBlock.data
                const initialBlockLevel = blockData.elevation
                const groundLevel = blockData.level
                const groundPos = blockPos

                const isEmptyBlock = (level: number) =>
                    worldModules.cavesDensity.getBlockDensity(asVect3(groundPos, level), groundLevel + 20)

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
                blockPos.y = currentLevel
                blockData.level = currentLevel
                yield iteratedBlock // groundBlock
            }
        }

        function* iterCeilingBlocks(inputBatchIterator: BatchDataIterator<{ elevation: number }>, patchKey: PatchKey) {
            for (const groundBlock of iterGroundBlocks(inputBatchIterator, patchKey)) {
                yield groundBlock
            }
        }

        const ioDataAdapter =
            dataFormat === BlocksDataFormat.FloatArrayXZ
                ? new FloatArrayIOAdapter(patchDim, processingInput as Float32Array)
                : recipe === BlocksTaskRecipe.Floor
                  ? new Vector3ArrayIOAdapter(patchDim, processingInput as Vector3[])
                  : new Vector2ArrayIOAdapter(patchDim, processingInput as Vector2[], processingParams.isDelegated)

        const itemsChunksProvider = (inputBatch: Vector2[]) => {
            const itemsTask = ItemsTask.sparsedChunks(inputBatch) // new ItemsTask().individualChunks(taskInput)
            // speed up queries at the cost of lesser accuracy (acceptable for LOD requests)
            itemsTask.processingParams.skipPostprocessing = true
            const itemsRes = itemsTask.process(taskHandlers)
            // console.log(`items count for : ${itemsRes.length} `)
            return (itemsRes || []) as SpawnChunk[]
        }

        let spawnedChunks =
            !SPLIT_SPAWNED_ITEMS_REQUEST && recipe === BlocksTaskRecipe.Peak ? itemsChunksProvider(ioDataAdapter.asInputPosArray()) : []
        const inputBatches = ioDataAdapter.splitIntoBatches()
        // const pendingBatches = Object.entries(inputBatches).map(async ([patchKey, batchIndices]) => {
        for (const [patchKey, batchIndices] of Object.entries(inputBatches)) {
            if (SPLIT_SPAWNED_ITEMS_REQUEST && recipe === BlocksTaskRecipe.Peak) {
                const batchInput: Vector2[] = []
                ioDataAdapter.iterBatchData(batchIndices).forEach(({ pos }) => batchInput.push(pos))
                spawnedChunks = itemsChunksProvider(batchInput)
                // console.log(`items count for ${patchKey}: ${itemsRes.length} `)
            }
            const inputBatchIterator: BatchDataIterator<any> = ioDataAdapter.iterBatchData(batchIndices)
            for (const block of batchProcessingIterator(inputBatchIterator, patchKey)) {
                if (block.data) {
                    const blockPos = block.pos.floor()
                    // const blockLevel = block.data.level
                    // blockPos.y = blockLevel
                    if (recipe === BlocksTaskRecipe.Peak) {
                        const itemChunk = spawnedChunks.find(chunk => asBox2(chunk.bounds).containsPoint(blockPos))
                        const upperBlock = itemChunk?.getUpperBlock(blockPos)
                        if (upperBlock) {
                            block.data.level = upperBlock.level
                            block.data.type = upperBlock.type || BlockType.NONE
                        }
                    }
                    ioDataAdapter.writeData(block.index, block)
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

        return ioDataAdapter.formatOutput()
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
