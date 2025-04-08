import { Box2, Box3, Vector2, Vector3 } from 'three'
import { ChunkContainer, ChunkDataContainer, ChunkDataStub, ChunkMetadata, ChunkStub } from '../datacontainers/ChunkContainer.js'
import { asPatchBounds, asVect3 } from '../utils/patch_chunk.js'
import {
  Block,
  BlockData,
  BlockRawData,
  PatchKey,
} from '../utils/common_types.js'
import { WorldModules } from '../WorldModules.js'

import {
  BaseProcessingParams,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'
import { BlocksProcessing } from './BlocksProcessing.js'
import { MapSpawnedElement } from '../procgen/ItemsMapDistribution.js'
import { ItemChunk, ItemFullStub } from '../factory/ChunksFactory.js'
import { pickSpawnedElement } from '../utils/misc_utils.js'

/**
 * Calling side
 */

export enum ItemsTaskRecipe {
  SpawnedElements = 'SpawnedElements',
  IndividualChunks = 'IndividualChunks',
  MergedChunk = 'MergedChunk',
  // PeakBlocksFromBatch = 'PeakBlocksFromBatch'
  // PointAllBlocks = 'PointAllBlocks',
  // PointHighestBlock = 'PointHighestBlock',
}

export type MapPickedElements = Record<string, Vector3[]>

export type ItemsTaskInput = Box2 | PatchKey | Vector2[]
export type ItemsTaskOutput = ChunkDataContainer | ChunkDataContainer[] | MapPickedElements
export type ItemsTaskParams = BaseProcessingParams & {
  recipe: ItemsTaskRecipe,
  useLighterProcessing?: boolean
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
    // console.log(`${this.processingInput}`)
    // console.log(rawTaskOutput)
    switch (recipe) {
      case ItemsTaskRecipe.IndividualChunks:
        return (rawTaskOutput as ItemFullStub[]).map(itemStub =>
          new ItemChunk(itemStub),
        )
      case ItemsTaskRecipe.MergedChunk:
        return new ChunkContainer().fromStub(rawTaskOutput as ChunkDataStub<ChunkMetadata>)
      default:
        return rawTaskOutput
    }
  }

  /**
   * Build templates for most common tasks, adjust manually if needed
   */

  /**
   * Instance version (allow use from child classes)
   * @param recipe 
   * @returns 
   */

  getBuildTemplate(recipe: ItemsTaskRecipe) {
    this.processingParams = { recipe }
    return (input: ProcessingInput) => {
      this.processingInput = input
      return this
    }
  }

  get spawnedElements() {
    return this.getBuildTemplate(ItemsTaskRecipe.SpawnedElements)
  }

  get individualChunks() {
    return this.getBuildTemplate(ItemsTaskRecipe.IndividualChunks)
  }

  get mergedChunk() {
    return this.getBuildTemplate(ItemsTaskRecipe.MergedChunk)
  }

  // get isolatedPointBlocks() {
  //   return this.factory(ItemsTaskRecipe.IsolatedPointBlocks)
  // }

  // get peakBlocksFromPointsBatch() {
  //   return this.factory(ItemsTaskRecipe.PeakBlocksFromBatch)
  // }

  /**
   * Static versions (allow better types inferance)
   * @param recipe 
   * @returns 
   */

  static factory = <ProcessingInput extends ItemsTaskInput, ProcessingOutput extends ItemsTaskOutput>(recipe: ItemsTaskRecipe) => (input: ProcessingInput) => {
    const task = new ItemsTask<ProcessingInput, ProcessingOutput>()
    task.handlerId = this.handlerId
    task.processingInput = input
    task.processingParams = { recipe }
    return task
  }

  static get spawnedElements() {
    return this.factory<ItemsTaskInput, MapPickedElements>(ItemsTaskRecipe.IndividualChunks)
  }

  static get individualChunks() {
    return this.factory<ItemsTaskInput, ChunkDataContainer[]>(ItemsTaskRecipe.IndividualChunks)
  }

  static get mergedChunk() {
    return this.factory<ItemsTaskInput, ChunkDataContainer>(ItemsTaskRecipe.MergedChunk)
  }

  // static get isolatedPointBlocks() {
  //   return this.factory(ItemsTaskRecipe.IsolatedPointBlocks)
  // }

  // static get pointPeakBlock() {
  //   return this.factory(ItemsTaskRecipe.PointPeakBlock)
  // }
}

/**
 * Handling side
 */

// {
//   spawnedItems: SpawnedItems
//   individualChunks?: ChunkContainer[]
//   mergedChunk?: ChunkContainer
//   isolatedPointBlocks?: number[]
// }
// const defaultProcessingParams: ItemsTaskParams = {
//   recipe: ItemsTaskRecipe.IndividualChunks,
// }

// type ItemsProcessingTask = ProcessingTask<ItemsTaskInput, ItemsTaskParams, ItemsTaskOutput>
type ItemsTaskStub = ProcessingTaskStub<
  ItemsTaskInput,
  ItemsTaskParams
>
type ItemsProcessingHandler = ProcessingTaskHandler<
  ItemsTaskInput,
  ItemsTaskParams,
  any
>


export const createItemsTaskHandler = (worldModules: WorldModules) => {
  const { taskHandlers, itemsInventory, itemsMapDistribution, worldLocalEnv } = worldModules

  const itemsTaskHandler: ItemsProcessingHandler = (taskStub: ItemsTaskStub) => {
    /**
     * Determine final item type and position
     * @param spawnedElements 
     * @returns 
     */
    const pickSpawnedElements = (spawnSlotsIndex: Record<number, MapSpawnedElement[]>) => {
      const pickedItems: MapPickedElements = {}
      // const nonOverlapable = []
      for (const [spawnSize, spawnSlots] of Object.entries(spawnSlotsIndex)) {
        // check spawn slots aren't hidden by bigger 

        const maxSpawnSize = parseInt(spawnSize)
        const taskInput = spawnSlots.map(elt => asVect3(elt.pos))
        const rawBlocksTask = new BlocksProcessing().rawData(taskInput)
        const rawBlocks = rawBlocksTask.process(taskHandlers)
        if (rawBlocks) {
          let i = 0
          for (const spawnedElement of spawnSlots) {
            const { randomIndex, pos } = spawnedElement
            const rawBlock = rawBlocks[i++]?.data as BlockRawData
            const { level, biome, landIndex } = rawBlock
            // const blockProcessor = new BlockProcessor(asVect3(pos), groundPatch)
            // const floorBlock = blockProcessor.getFloorBlock()
            const { flora } = worldModules.biomes.mappings[biome].nth(landIndex).data
            const pickedElement = pickSpawnedElement(flora, randomIndex, maxSpawnSize)
            if (pickedElement) {
              // check if picked element is overlapable or not
              // const elementTemplate = 
              pickedItems[pickedElement] = pickedItems[pickedElement] || []
              pickedItems[pickedElement]?.push(asVect3(pos, level))
            }
          }
        }
      }
      // console.log(`${taskInput.length} => ${count}`)
      return pickedItems
    }

    /**
     * using shared data containers to avoid copying data from original template
     */
    const buildSpawnedChunks = (spawnedItems: MapPickedElements,) => {
      const spawnedChunks = []
      const groundBlocksProvider = (input: Vector3[]) => {
        const blocksTask = new BlocksProcessing().groundPositions(input)
        blocksTask.processingParams.includeDensity = true
        const blocksRes = blocksTask.process(taskHandlers)
        return (blocksRes || []) as Block<BlockData>[]
      }

      for (const [itemType, itemsPositions] of Object.entries(spawnedItems)) {
        for (const itemPos of itemsPositions) {
          const itemTemplate = itemsInventory.catalog[itemType]
          if (itemTemplate) {
            const instancedChunk = new ItemChunk(itemTemplate, itemPos) //itemTemplate.toInstancedChunk(itemPos, true, skipCloning)
            const isDiscarded = !useLighterProcessing && instancedChunk.adjustToGround(groundBlocksProvider)
            !isDiscarded && spawnedChunks.push(instancedChunk)
          }
        }
      }
      return spawnedChunks
    }

    /**
     * merge all individual items chunks into unique container
     */
    const mergeSpawnedChunks = (individualChunks: ItemChunk[]) => {
      const mergeChunkBounds = new Box3()
      for (const itemChunk of individualChunks) {
        mergeChunkBounds.union(itemChunk?.bounds)
      }
      const mergeChunk = new ChunkDataContainer(mergeChunkBounds, 1)
      for (const itemChunk of individualChunks) {
        itemChunk.copyContentToTarget(mergeChunk)
      }
      return mergeChunk
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

    const { processingInput, processingParams } = taskStub
    const { recipe, useLighterProcessing } = processingParams
    const inputQuery = typeof processingInput === 'string' ? asPatchBounds(processingInput, worldLocalEnv.getPatchDimensions()) : processingInput
    const spawnSlotsIndex = itemsMapDistribution.queryMapArea(inputQuery)
    const spawnedElements = pickSpawnedElements(spawnSlotsIndex)

    if (recipe === ItemsTaskRecipe.SpawnedElements) {
      return spawnedElements
    }
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
    else {
      const spawnedChunks = buildSpawnedChunks(spawnedElements)
      if (recipe === ItemsTaskRecipe.IndividualChunks) {
        return processingParams.isDelegated ? spawnedChunks.map(chunk => chunk.toStub()) : spawnedChunks
      }
      else if (recipe === ItemsTaskRecipe.MergedChunk) {
        const mergedChunk = mergeSpawnedChunks(spawnedChunks)
        return mergedChunk
      }
    }
  }
  return itemsTaskHandler
}
