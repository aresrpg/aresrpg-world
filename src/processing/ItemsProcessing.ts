import { Box2, Vector2 } from 'three'

import { ChunkContainer, DataChunkStub } from '../datacontainers/ChunkContainer.js'
import { asPatchBounds, parseThreeStub } from '../utils/patch_chunk.js'
import { BlockData, PatchDataCell, PatchKey } from '../utils/common_types.js'
import { WorldModules } from '../factory/WorldModules.js'
import { ChunkBlocksContainer, SpawnChunk, SpawnChunkStub, SpawnData } from '../factory/ChunksFactory.js'
import { BlocksTask } from './BlocksProcessing.js'
import { BaseProcessingParams, ProcessingTask, ProcessingTaskHandler, ProcessingTaskStub } from './TaskProcessing.js'

/**
 * Calling side
 */

export enum ItemsTaskRecipe {
    SpawningItems = 'SpawningItems',
    SparsedChunks = 'SparsedChunks',
    MergedChunk = 'MergedChunk',
    // PeakBlocksFromBatch = 'PeakBlocksFromBatch'
    // PointAllBlocks = 'PointAllBlocks',
    // PointHighestBlock = 'PointHighestBlock',
}

export type ItemsTaskInput = Box2 | PatchKey | Vector2[]
export type ItemsTaskOutput = ChunkBlocksContainer | SpawnChunk[] | SpawnChunkStub[] | SpawnData[]
export type ItemsTaskParams = BaseProcessingParams & {
    recipe: ItemsTaskRecipe
    skipPostprocessing?: boolean // specify if ground adjustments (costlier) will be done or not
    skipOverlapPruning?: boolean
    spawnInsideAreaOnly?: boolean
}

export class ItemsTask<ProcessingInput extends ItemsTaskInput, ProcessingOutput extends ItemsTaskOutput> extends ProcessingTask<
    ProcessingInput,
    ItemsTaskParams,
    ProcessingOutput
> {
    static handlerId = 'ItemsProcessing'

    constructor() {
        super(ItemsTask.handlerId)
    }

    override postProcess(rawTaskOutput: any) {
        const { recipe } = this.processingParams
        switch (recipe) {
            case ItemsTaskRecipe.SparsedChunks:
                return (rawTaskOutput as SpawnChunkStub[]).map(itemStub => new SpawnChunk(itemStub))
            case ItemsTaskRecipe.MergedChunk:
                return new ChunkContainer().fromStub(rawTaskOutput as DataChunkStub)
            default:
                return rawTaskOutput
        }
    }

    /**
     * Build templates for most common tasks, allowing manual post adjustment through processingParams
     * - instance versions allow use from child classes
     * - static versions allow better types inferance
     */

    /**
     * Instance versions
     * @param recipe
     * @returns
     */

    getBuildTemplate(recipe: ItemsTaskRecipe) {
        this.processingParams.recipe = recipe
        return (input: ProcessingInput) => {
            this.processingInput = input
            return this
        }
    }

    get spawnedItems() {
        return this.getBuildTemplate(ItemsTaskRecipe.SpawningItems)
    }

    get sparsedChunks() {
        return this.getBuildTemplate(ItemsTaskRecipe.SparsedChunks)
    }

    get mergedChunk() {
        return this.getBuildTemplate(ItemsTaskRecipe.MergedChunk)
    }

    /**
     * Static versions
     */

    static factory =
        <ProcessingInput extends ItemsTaskInput, ProcessingOutput extends ItemsTaskOutput>(recipe: ItemsTaskRecipe) =>
            (input: ProcessingInput) => {
                const task = new ItemsTask<ProcessingInput, ProcessingOutput>()
                task.handlerId = this.handlerId
                task.processingInput = input
                task.processingParams = { recipe }
                return task
            }

    // static get spawnedElements() {
    //     return this.factory<ItemsTaskInput, MapPickedElements>(ItemsTaskRecipe.IndividualChunks)
    // }

    static get sparsedChunks() {
        return this.factory<ItemsTaskInput, SpawnChunk[]>(ItemsTaskRecipe.SparsedChunks)
    }

    static get mergedChunk() {
        return this.factory<ItemsTaskInput, ChunkBlocksContainer>(ItemsTaskRecipe.MergedChunk)
    }
}

/**
 * Handling side
 */

// type ItemsProcessingTask = ProcessingTask<ItemsTaskInput, ItemsTaskParams, ItemsTaskOutput>
type ItemsTaskStub = ProcessingTaskStub<ItemsTaskInput, ItemsTaskParams>
type ItemsProcessingHandler = ProcessingTaskHandler<ItemsTaskInput, ItemsTaskParams, any>

export type DiscardedSlot = Partial<SpawnData> & {
    spawnStage: number
    spawnPass: number
    bounds?: Box2
}

export const createItemsTaskHandler = (worldModules: WorldModules) => {
    const { taskHandlers, worldLocalEnv, spawn } = worldModules

    const itemsTaskHandler: ItemsProcessingHandler = (taskStub: ItemsTaskStub) => {


        const { processingInput, processingParams } = taskStub
        const { recipe, skipPostprocessing, skipOverlapPruning, spawnInsideAreaOnly } = processingParams
        const inputQuery =
            typeof processingInput === 'string'
                ? asPatchBounds(processingInput, worldLocalEnv.getPatchDimensions())
                : parseThreeStub(processingInput)

        const groundBlocksProvider = (input: Vector2[]) => {
            const blocksTask = new BlocksTask().groundPositions(input)
            blocksTask.processingParams.includeDensity = true
            const blocksRes = blocksTask.process(taskHandlers)
            return (blocksRes || []) as PatchDataCell<BlockData>[]
        }
        // nonOverlappingChunks.length > 0 && console.log(nonOverlappingChunks.map(chunk => chunk.spawnType))
        const sparsedChunks = spawn.querySparseChunks(inputQuery, spawnInsideAreaOnly, skipOverlapPruning)
        // adjust item position to terrain
        const spawnedChunks = skipPostprocessing ? sparsedChunks : sparsedChunks.filter(sparseChunk => sparseChunk.fitGround(groundBlocksProvider))


        switch (recipe) {
            case ItemsTaskRecipe.SpawningItems: {
                const allStubs = () => [...spawnedChunks.map(spawnChunk => spawnChunk.toLightStub())]//, ...discardedSlots]
                return processingParams.isDelegated ? allStubs() : spawnedChunks
                // return processingParams.isDelegated ? spawnedChunks.map(spawnChunk => spawnChunk.toLightStub()) : spawnedChunks
            }
            case ItemsTaskRecipe.SparsedChunks:
                return processingParams.isDelegated ? spawnedChunks.map(spawnChunk => spawnChunk.toStub()) : spawnedChunks
            case ItemsTaskRecipe.MergedChunk: {
                const mergedChunk = new ChunkBlocksContainer(undefined, 1).fromMergedChunks(spawnedChunks)
                return processingParams.isDelegated ? mergedChunk.toStub() : mergedChunk
            }
            default:
                return spawnedChunks
        }
    }
    return itemsTaskHandler
}

// const queryPeakBlockAtPosition = async (requestedPos: Vector2, itemsChunks: ItemChunk[]) => {
//   const peakBlock = {
//     level: 0,
//     type: BlockType.NONE,
//   }
//   const overlappingChunks = itemsChunks.filter(chunk => chunk)
//   for await (const itemChunk of overlappingChunks) {
//     const localPos = itemChunk.toLocalPos(asVect3(requestedPos))
//     const dataArray = itemChunk.readBuffer(asVect2(localPos))
//     dataArray.reverse()
//     const index = dataArray.findIndex(val => !!val)

//     if (index !== -1) {
//       const peakBlockLevel = itemChunk.bounds.max.y - index
//       const rawData = dataArray[index]
//       if (rawData && peakBlockLevel > peakBlock.level) {
//         peakBlock.level = peakBlockLevel
//         peakBlock.type = rawData || BlockType.NONE
//       }
//     }
//   }
//   return peakBlock
// }

// /**
//  * needs: spawned items + requested pos (externally provided)
//  * provides: items blocks at requested pos
//  *
//  * note: several spawned overlapping objects may be found at queried position
//  */
// const queryPointBlocks = async (
//   spawnedItems: SpawnedItems,
//   requestedPos: Vector3,
// ) => {
//   const mergeBuffer: number[] = []
//   for await (const [itemType, spawnPlaces] of Object.entries(
//     spawnedItems,
//   )) {
//     for await (const spawnOrigin of spawnPlaces) {
//       const template = await itemsInventory.catalog[itemType]//?.toInstancedChunk(spawnOrigin)
//       if (template) {
//         // create ghost instance to avoid to temporarily copy data from original template
//         const ghost = new ItemChunk(template?.bounds)
//         const localPos = ghost.toLocalPos(requestedPos)
//         const yOffset = requestedPos.y - spawnOrigin.y
//         const sliceSectorData = template.readBuffer(asVect2(localPos))
//         const sourceOffset = Math.max(yOffset, 0)
//         const targetOffset = -Math.min(yOffset, 0)
//         sliceSectorData.slice(sourceOffset).forEach((val, i) => {
//           const index = i + targetOffset
//           while (mergeBuffer.length <= index) mergeBuffer.push(0)
//           mergeBuffer[i + targetOffset] = val
//         })
//         // const sliceSectors = templateChunk.iterChunkSlice(location)
//         // for (const sliceSector of sliceSectors) {
//         //   sliceSectorData = sliceSector.data
//         // }
//       }
//     }
//   }
//   return mergeBuffer
// }

// else if (recipe === ItemsTaskRecipe.IsolatedPointBlocks) {
//   if (processingInput instanceof Vector3) {
//     return await queryPointBlocks(spawnedItems, processingInput)
//   } else {
//     console.warn(`invalid input provided for point query`)
//     const emptyOutput: number[] = []
//     return emptyOutput
//   }
// }
// else if (recipe === ItemsTaskRecipe.PointPeakBlock) {
//   if (processingInput instanceof Vector2) {
//     return await queryPointPeakBlock(spawnedItems, processingInput)
//   } else {
//     console.warn(`invalid input provided for point query`)
//     const emptyOutput = { level: 0, type: BlockType.NONE }
//     return emptyOutput
//   }
// }
