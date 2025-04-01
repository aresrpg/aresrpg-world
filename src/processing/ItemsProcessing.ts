import { Box2, Box3, Vector2, Vector3 } from 'three'
import { ChunkContainer, ChunkMetadata, ChunkStub } from '../datacontainers/ChunkContainer.js'
import { asPatchBounds, asVect3 } from '../utils/patch_chunk.js'
import {
  BlockRawData,
  BlockType,
  ItemType,
  PatchKey,
  VoidItemType,
} from '../utils/common_types.js'
import { WorldModules } from '../WorldModules.js'

import {
  GenericTaskHandler,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'
import { BlocksProcessing } from './BlocksProcessing.js'
import { SpawnedElement } from '../procgen/ItemsDistribution.js'

/**
 * Calling side
 */

export enum ItemsTaskRecipe {
  SpawnedElements = 'SpawnedElements',
  SpawnedChunks = 'SpawnedChunks',
  MergedChunk = 'MergedChunk',
  // IsolatedPointBlocks = 'IsolatedPointBlocks',
  // PointPeakBlock = 'PointPeakBlock',
}

export type ItemsTaskInput = Vector2 | Box2 | PatchKey
export type ItemsTaskOutput = ChunkContainer | ChunkContainer[]
export type ItemsTaskParams = {
  recipe: ItemsTaskRecipe,
  itemsSamplingRes?: number
}

export class ItemsTask extends ProcessingTask<
  ItemsTaskInput,
  ItemsTaskParams,
  ItemsTaskOutput
> {
  static handlerId = 'ItemsProcessing'

  override postProcess(rawTaskOutput: any) {
    const { recipe } = this.processingParams
    // console.log(`${this.processingInput}`)
    // console.log(rawTaskOutput)
    switch (recipe) {
      case ItemsTaskRecipe.SpawnedChunks:
        return (rawTaskOutput as ChunkStub<ChunkMetadata>[]).map(stub =>
          new ChunkContainer().fromStub(stub),
        )
      case ItemsTaskRecipe.MergedChunk:
        return new ChunkContainer().fromStub(rawTaskOutput as ChunkStub<ChunkMetadata>)
      default:
        return rawTaskOutput
    }
  }

  factory(recipe: ItemsTaskRecipe) {
    this.handlerId = ItemsTask.handlerId
    this.processingParams = { recipe }
    return (input: ItemsTaskInput) => {
      this.processingInput = input
      return this
    }
  }

  /**
   * Direct access to most common tasks, for further customization, adjust processing params
   */

  get bakeIndividualChunks() {
    return this.factory(ItemsTaskRecipe.SpawnedChunks)
  }

  get mergeIndividualChunks() {
    return this.factory(ItemsTaskRecipe.MergedChunk)
  }

  // get isolatedPointBlocks() {
  //   return this.factory(ItemsTaskRecipe.IsolatedPointBlocks)
  // }

  // get pointPeakBlock() {
  //   return this.factory(ItemsTaskRecipe.PointPeakBlock)
  // }

  /**
   * Static versions kept for backward compat with previous API but could be removed
   */

  static factory = (recipe: ItemsTaskRecipe) => (input: ItemsTaskInput) => {
    const task = new ItemsTask()
    task.handlerId = this.handlerId
    task.processingInput = input
    task.processingParams = { recipe }
    return task
  }

  static get bakeIndividualChunks() {
    return this.factory(ItemsTaskRecipe.SpawnedChunks)
  }

  static get mergeIndividualChunks() {
    return this.factory(ItemsTaskRecipe.MergedChunk)
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
type ItemsProcessingTaskStub = ProcessingTaskStub<
  ItemsTaskInput,
  ItemsTaskParams
>
type ItemsProcessingTaskHandler = ProcessingTaskHandler<
  ItemsTaskInput,
  ItemsTaskParams,
  any
>



export const createItemsTaskHandler = (worldModules: WorldModules) => {
  const { taskHandlers, itemsInventory, itemsDistribution, worldLocalEnv } = worldModules

  const itemsTaskHandler: ItemsProcessingTaskHandler = async (
    taskStub: ItemsProcessingTaskStub,
  ) => {

    const retrieveItemBottomBlocks = async (itemChunk: ChunkContainer) => {
      const chunkBottomBlocks: Vector3[] = []
      const blocksTaskHandler = taskHandlers[BlocksProcessing.handlerId]
      // iter slice blocks
      for (const heightBuff of itemChunk.iterChunkSlice()) {
        if (heightBuff.data[0])
          chunkBottomBlocks.push(asVect3(heightBuff.pos, 0))
      }
      const blocksTask = new BlocksProcessing().groundPositions(chunkBottomBlocks)
      blocksTask.processingParams.includeDensity = true
      const blocksBatch = await blocksTask.process(blocksTaskHandler as any)
      // console.log(testBlock)
      return blocksBatch
    }

    /**
     * discard schematics above terrain holes + adjust chunk elevation on ground
     * @param itemChunk
     * @returns
     */
    const discardOrAdjustItemChunk = async (itemChunk: ChunkContainer) => {
      let isItemDiscarded = true
      const blocksResult = await retrieveItemBottomBlocks(itemChunk)
      const itemBottomBlocks = Object.values(blocksResult)
      const hasHoleBlock = itemBottomBlocks.find(
        block => block.data.type === BlockType.HOLE,
      )
      // any schematics having at least one hole block below is considered discarded
      if (!hasHoleBlock) {
        // adjust item's final height
        const [lowestBlock] = itemBottomBlocks.sort(
          (b1, b2) => b1.data.level - b2.data.level,
        )
        const lowestHeight = lowestBlock?.data.level || 0
        const heightOffset = itemChunk.bounds.min.y - lowestHeight
        // adjust chunk elevation according to lowest block
        itemChunk.bounds.translate(new Vector3(0, -heightOffset, 0))
        isItemDiscarded = false
      }
      if(isItemDiscarded) console.log('discarded item: ', itemChunk)
      return isItemDiscarded
    }

    /**
     * Determine final item type and position
     * @param spawnedElements 
     * @returns 
     */
    const pickSpawnedItems = async (spawnedElements: SpawnedElement[]) => {
      const pickedItems: Record<ItemType, Vector3[]> = {}
      const blocksTaskHandler = taskHandlers[BlocksProcessing.handlerId] as GenericTaskHandler
      const taskInput = spawnedElements.map(elt => asVect3(elt.pos))
      const rawBlocksTask = new BlocksProcessing().rawData(taskInput)
      const rawBlocks = await rawBlocksTask.process(blocksTaskHandler)
      let i = 0
      let count = 0
      for await (const spawnedElement of spawnedElements) {
        const { randomIndex, pos } = spawnedElement
        const rawBlock = rawBlocks[i++]?.data as BlockRawData
        const { level, biome, landIndex } = rawBlock
        // const blockProcessor = new BlockProcessor(asVect3(pos), groundPatch)
        // const floorBlock = blockProcessor.getFloorBlock()
        const landConf = worldModules.biomes.mappings[biome].nth(landIndex).data
        const { flora: weightedFlora } = landConf
        if (weightedFlora) {
          const eligibleList: string[] = []
          const templateIndex = await itemsInventory.getTemplateIndex(Object.keys(weightedFlora))
          Object.entries(weightedFlora).forEach(([itemType, itemWeight]) => {
            const isMatchingTemplateSize = () => {
              const templateStub = templateIndex[itemType]?.toStub()
              const templateSize = templateStub?.metadata.itemSize
              return templateSize !== undefined && spawnedElement.spawnableSizes.includes(templateSize)
            }
            const isEligible = itemType === VoidItemType || isMatchingTemplateSize()
            // reject any item not matching size requirements at specific pos
            if (isEligible) {
              while (itemWeight > 0) {
                eligibleList.push(itemType)
                itemWeight--
              }
            }
          })
          // among items matching spawnable sizes pick one using random generated index
          const pickedItemType = eligibleList[randomIndex % eligibleList.length] || ''
          pickedItems[pickedItemType] = pickedItems[pickedItemType] || []
          pickedItems[pickedItemType]?.push(asVect3(pos, level))
          count++
        }
      }
      // console.log(`${taskInput.length} => ${count}`)
      return pickedItems
    }

    const buildSpawnedChunks = async (spawnedItems: Record<ItemType, Vector3[]>) => {
      const spawnedChunks = []
      for await (const [itemType, itemsPositions] of Object.entries(spawnedItems)) {
        for (const itemPos of itemsPositions) {
          const itemTemplate = await itemsInventory.getTemplate(itemType)
          if (itemTemplate) {
            //await itemsInventory.getTemplate(pickedItemType)
            const instancedChunk = itemTemplate.toInstancedChunk(itemPos)
            const isDiscarded = await discardOrAdjustItemChunk(instancedChunk)
            !isDiscarded && spawnedChunks.push(instancedChunk)
          }
        }
      }
      return spawnedChunks
    }

    /**
     * needs: individual items
     * provides: merged items chunk
     */
    const mergeSpawnedChunks = (individualChunks: ChunkContainer[]) => {
      const mergeChunkBounds = new Box3()
      for (const itemChunk of individualChunks) {
        mergeChunkBounds.union(itemChunk?.bounds)
      }
      const mergeChunk = new ChunkContainer(mergeChunkBounds, 1)
      for (const itemChunk of individualChunks) {
        ChunkContainer.copySourceToTarget(itemChunk, mergeChunk)
      }
      return mergeChunk
    }

    // const queryPointPeakBlock = async (
    //   spawnedItems: SpawnedItems,
    //   requestedPos: Vector2
    // ) => {
    //   const peakBlock = {
    //     level: 0,
    //     type: BlockType.NONE,
    //   }
    //   for await (const [itemType, spawnPlaces] of Object.entries(
    //     spawnedItems,
    //   )) {
    //     for await (const spawnOrigin of spawnPlaces) {
    //       const template = await itemsInventory.catalog[itemType]//?.toInstancedChunk(spawnOrigin)
    //       if (template) {
    //         // create ghost instance to avoid to temporarily copy data  from original template
    //         const ghost = new ItemChunk(template?.bounds)
    //         ghost.centerBounds(spawnOrigin)
    //         const localPos = ghost.toLocalPos(asVect3(requestedPos))
    //         const dataArray = template.readBuffer(asVect2(localPos))
    //         dataArray.reverse()
    //         const index = dataArray.findIndex(val => !!val)

    //         if (index !== -1) {
    //           const peakBlockLevel = ghost.bounds.max.y - index
    //           const rawData = dataArray[index]
    //           if (rawData && peakBlockLevel > peakBlock.level) {
    //             peakBlock.level = peakBlockLevel
    //             peakBlock.type = rawData || BlockType.NONE
    //           }
    //         }
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
    const { recipe } = processingParams
    const inputQuery = typeof processingInput === 'string' ? asPatchBounds(processingInput, worldLocalEnv.getPatchDimensions()) : processingInput
    const spawnableElements = itemsDistribution.queryMapArea(inputQuery)
    const pickedElements = await pickSpawnedItems(spawnableElements)

    if (recipe === ItemsTaskRecipe.SpawnedElements) {
      return pickedElements
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
      const spawnedChunks = await buildSpawnedChunks(pickedElements)
      if (recipe === ItemsTaskRecipe.SpawnedChunks) {
        return spawnedChunks.map(chunk => chunk.toStub())
      } else {
        const mergedChunk = await mergeSpawnedChunks(spawnedChunks)
        return mergedChunk
      }
    }
  }
  return itemsTaskHandler
}
