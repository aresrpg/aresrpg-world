import { Box2, Vector2, Vector3 } from 'three'

import { ChunkContainer, ChunkDataContainer, ChunkDataStub, ChunkMetadata } from '../datacontainers/ChunkContainer.js'
import { asBox2, asPatchBounds, asVect3, parseThreeStub } from '../utils/patch_chunk.js'
import { Block, BlockData, BlockRawData, PatchKey, SpawnCategory, SpawnType } from '../utils/common_types.js'
import { WorldModules } from '../factory/WorldModules.js'
import { SpawnChunk, SpawnChunkStub, SpawnData } from '../factory/ChunksFactory.js'
import { pickSpawnedElement } from '../utils/misc_utils.js'

import { BlocksTask } from './BlocksProcessing.js'
import { BaseProcessingParams, ProcessingTask, ProcessingTaskHandler, ProcessingTaskStub } from './TaskProcessing.js'
import { SpawnSlot } from '../procgen/SpawnDistributionMap.js'

/**
 * Calling side
 */

export enum ItemsTaskRecipe {
    SpawnedElements = 'SpawnedElements',
    SpawnedChunks = 'SpawnedChunks',
    MergedSpawnedChunk = 'MergedSpawnedChunk',
    // PeakBlocksFromBatch = 'PeakBlocksFromBatch'
    // PointAllBlocks = 'PointAllBlocks',
    // PointHighestBlock = 'PointHighestBlock',
}

export type ItemsTaskInput = Box2 | PatchKey | Vector2[]
export type ItemsTaskOutput = ChunkDataContainer<ChunkBlockData> | SpawnChunk[] | SpawnChunkStub[] | SpawnData[]
export type ItemsTaskParams = BaseProcessingParams & {
    recipe: ItemsTaskRecipe
    skipPostprocessing?: boolean    // specify if ground adjustments (costlier) will be done or not
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
            case ItemsTaskRecipe.SpawnedChunks:
                return (rawTaskOutput as SpawnChunkStub[]).map(itemStub => new SpawnChunk(itemStub))
            case ItemsTaskRecipe.MergedSpawnedChunk:
                return new ChunkContainer().fromStub(rawTaskOutput as ChunkDataStub<ChunkMetadata>)
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

    get spawnedElements() {
        return this.getBuildTemplate(ItemsTaskRecipe.SpawnedElements)
    }

    get spawnedChunks() {
        return this.getBuildTemplate(ItemsTaskRecipe.SpawnedChunks)
    }

    get mergedSpawnChunk() {
        return this.getBuildTemplate(ItemsTaskRecipe.MergedSpawnedChunk)
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

    static get spawnedChunks() {
        return this.factory<ItemsTaskInput, SpawnChunk[]>(ItemsTaskRecipe.SpawnedChunks)
    }

    static get mergedSpawnChunk() {
        return this.factory<ItemsTaskInput, ChunkDataContainer>(ItemsTaskRecipe.MergedSpawnedChunk)
    }
}

/**
 * Handling side
 */

// type ItemsProcessingTask = ProcessingTask<ItemsTaskInput, ItemsTaskParams, ItemsTaskOutput>
type ItemsTaskStub = ProcessingTaskStub<ItemsTaskInput, ItemsTaskParams>
type ItemsProcessingHandler = ProcessingTaskHandler<ItemsTaskInput, ItemsTaskParams, any>

export type DiscardedSlot = Partial<SpawnData> & {
    spawnStage: number,
    spawnPass: number,
    bounds?: Box2
}


export const createItemsTaskHandler = (worldModules: WorldModules) => {
    const { taskHandlers, itemsInventory, spawnDistributionMap, worldLocalEnv } = worldModules

    const itemsTaskHandler: ItemsProcessingHandler = (taskStub: ItemsTaskStub) => {
        const discardedSlots: DiscardedSlot[] = []

        /**
         * Determine final item type and position and use shared data containers 
         * to avoid copying data from original template
         * @param spawnedElements
         * @returns
         */
        const buildSpawnedChunks = (spawnSlotsIndex: Record<number, SpawnSlot[]>) => {
            const biomesMappings = worldModules.biomes.mappings
            const spawnedChunks: SpawnChunk[] = []
            const nonOverlappingChunks: Box2[] = []
            const sortedKeys = Object.keys(spawnSlotsIndex).map(key => parseInt(key)).sort((a, b) => b - a)
            for (const maxSpawnSize of sortedKeys) {
                const spawnPass = maxSpawnSize
                const spawnSlots = spawnSlotsIndex[maxSpawnSize] as SpawnSlot[]
                // do first discarding based on spawnOrigin
                const availableSlots = skipOverlapPruning ? spawnSlots :
                    spawnSlots.filter((spawnSlot) => {
                        const isDiscarded = nonOverlappingChunks.find(item => item.containsPoint(spawnSlot.pos))
                        isDiscarded && discardedSlots.push({
                            spawnOrigin: asVect3(spawnSlot.pos),
                            spawnStage: 0,
                            spawnPass
                        })
                        return !isDiscarded
                    })
                const taskInput = availableSlots.map(elt => asVect3(elt.pos))
                const rawBlocksTask = new BlocksTask().groundPositions(taskInput)
                rawBlocksTask.processingParams.includeRawData = true
                const rawBlocks = rawBlocksTask.process(taskHandlers) as Block<BlockData>[]
                if (rawBlocks) {
                    availableSlots.forEach((slot, i) => {
                        const { randomIndex, pos } = slot
                        const rawBlock = rawBlocks[i++]?.data as BlockRawData
                        const { level, biome, landIndex } = rawBlock
                        const { flora } = biomesMappings[biome].nth(landIndex).data
                        const pickedElement = pickSpawnedElement(flora, randomIndex, maxSpawnSize)
                        if (pickedElement) {
                            const templateStub = itemsInventory.catalog[pickedElement]
                            if (templateStub) {
                                // using shared data containers to avoid copying data from original template
                                const spawnChunk = new SpawnChunk(templateStub, asVect3(pos, level))
                                // once spawn type is known do second discarding based on spawned shape
                                const isDiscarded = !skipOverlapPruning && nonOverlappingChunks.find(item => item.intersectsBox(asBox2(spawnChunk.bounds)))
                                isDiscarded ? discardedSlots.push({ ...spawnChunk.toLightStub(), spawnStage: 2, spawnPass }) : spawnedChunks.push(spawnChunk)
                                // check if picked element is overlapable or not
                                spawnChunk.spawnCat === SpawnCategory.Structure && nonOverlappingChunks.push(asBox2(spawnChunk.bounds))
                            }
                        }
                    })
                }
            }

            // nonOverlappingChunks.length > 0 && console.log(nonOverlappingChunks.map(chunk => chunk.spawnType))
            return skipPostprocessing ?
                spawnedChunks :
                spawnedChunks.filter(spawnChunk => spawnChunk.fitGround(groundBlocksProvider))
        }

        const { processingInput, processingParams } = taskStub
        const { recipe, skipPostprocessing, skipOverlapPruning, spawnInsideAreaOnly } = processingParams
        const inputQuery =
            typeof processingInput === 'string' ? asPatchBounds(processingInput, worldLocalEnv.getPatchDimensions()) : parseThreeStub(processingInput)
        const spawnSlotsIndex = spawnDistributionMap.queryMapArea(inputQuery, spawnInsideAreaOnly)
        const groundBlocksProvider = (input: Vector3[]) => {
            const blocksTask = new BlocksTask().groundPositions(input)
            blocksTask.processingParams.includeDensity = true
            const blocksRes = blocksTask.process(taskHandlers)
            return (blocksRes || []) as Block<BlockData>[]
        }
        const spawnedChunks = buildSpawnedChunks(spawnSlotsIndex)

        switch (recipe) {
            case ItemsTaskRecipe.SpawnedElements:
                {
                    const allStubs = () => ([...spawnedChunks.map(spawnChunk => spawnChunk.toLightStub()), ...discardedSlots])
                    return processingParams.isDelegated ? allStubs() : spawnedChunks
                    // return processingParams.isDelegated ? spawnedChunks.map(spawnChunk => spawnChunk.toLightStub()) : spawnedChunks
                }
            case ItemsTaskRecipe.SpawnedChunks:
                return processingParams.isDelegated ? spawnedChunks.map(spawnChunk => spawnChunk.toStub()) : spawnedChunks
            case ItemsTaskRecipe.MergedSpawnedChunk:
                const mergedChunk = new ChunkDataContainer(undefined, 1).fromMergedChunks(spawnedChunks)
                return processingParams.isDelegated ? mergedChunk.toStub() : mergedChunk
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