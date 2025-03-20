import { Box2, Box3, Vector2, Vector3 } from 'three'

import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer.js'
import {
  BlocksProcessing,
  DistributionProfile,
  ProcessingTask,
  PseudoDistributionMap,
} from '../index.js'
import { asPatchBounds, asVect2, asVect3 } from '../utils/patch_chunk.js'
import {
  BlockType,
  ItemType,
  PatchKey,
  SpawnedItems,
  VoidItemType,
} from '../utils/common_types.js'
import { WorldModules, WorldProcessingEnvironment } from '../WorldModules.js'
import { BlueNoiseParams } from '../procgen/BlueNoisePattern.js'

import { GroundPatch } from './GroundPatch.js'
import { DistributionProfiles } from './RandomDistributionMap.js'
import { ProcessingTaskHandler, ProcessingTaskStub } from './TaskProcessing.js'
import { blocksProcessingHandlerName } from './BlocksProcessing.js'

/**
 * Calling side
 */

export const itemsProcessingHandlerName = `ItemsProcessing`

export enum ItemsProcessingRecipe {
  SpawnedItems = 'SpawnedItems',
  IndividualChunks = 'IndividualChunks',
  MergeIndividualChunks = 'MergeIndividualChunks',
  IsolatedPointBlocks = 'IsolatedPointBlocks',
  PointPeakBlock = 'PointPeakBlock',
}

type ItemsProcessingInput = Vector2 | Box2 | PatchKey
type ItemsProcessingParams = {
  recipe: ItemsProcessingRecipe
}
type ItemsProcessingOutput = ChunkContainer | ChunkContainer[]

const noParser = (stubs: any) => stubs
const chunkStubParser = (chunkStub: ChunkStub) =>
  new ChunkContainer().fromStub(chunkStub)
const chunkStubsParser = (stubs: ChunkStub[]) => stubs.map(chunkStubParser)

const stubsParsers: Partial<
  Record<ItemsProcessingRecipe, (stubs: any) => any>
> = {
  [ItemsProcessingRecipe.IndividualChunks]: chunkStubsParser,
  [ItemsProcessingRecipe.MergeIndividualChunks]: chunkStubParser,
}

// constructor
const ItemsProcessingTaskConstructor = ProcessingTask<
  ItemsProcessingInput,
  ItemsProcessingParams,
  ItemsProcessingOutput
>

const createItemsProcessingTask =
  (recipe: ItemsProcessingRecipe) => (input: ItemsProcessingInput) => {
    const task = new ItemsProcessingTaskConstructor()
    task.handlerId = itemsProcessingHandlerName
    task.processingInput = input
    task.processingParams = { recipe }
    task.postProcess = stubsParsers[recipe] || noParser
    return task
  }

// Exposed API

export const ItemsProcessing = {
  bakeIndividualChunks: createItemsProcessingTask(
    ItemsProcessingRecipe.IndividualChunks,
  ),
  mergeIndividualChunks: createItemsProcessingTask(
    ItemsProcessingRecipe.MergeIndividualChunks,
  ),
  isolatedPointBlocks: createItemsProcessingTask(
    ItemsProcessingRecipe.IsolatedPointBlocks,
  ),
  pointPeakBlock: createItemsProcessingTask(
    ItemsProcessingRecipe.PointPeakBlock,
  ),
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
// const defaultProcessingParams: ItemsProcessingParams = {
//   recipe: ItemsProcessingRecipe.IndividualChunks,
// }

// type ItemsProcessingTask = ProcessingTask<ItemsProcessingInput, ItemsProcessingParams, ItemsProcessingOutput>
type ItemsProcessingTaskStub = ProcessingTaskStub<
  ItemsProcessingInput,
  ItemsProcessingParams
>
type ItemsProcessingTaskHandler = ProcessingTaskHandler<
  ItemsProcessingInput,
  ItemsProcessingParams,
  any
>

// Defaults

type ItemsProcessingDefaults = {
  spawnMap: PseudoDistributionMap
  itemDims: Vector3
}

const defaultDistribution: BlueNoiseParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}

const getItemsProcessingDefaults = (dimensions: Vector2) => {
  const res: ItemsProcessingDefaults = {
    spawnMap: new PseudoDistributionMap(dimensions, defaultDistribution),
    itemDims: new Vector3(10, 13, 10),
  }
  return res
}

export const createItemsTaskHandler = (worldProcEnv: WorldProcessingEnvironment) => {
  const { worldModules, worldLocalEnv, taskHandlers } = worldProcEnv
  const { itemsInventory } = worldModules
  const defaults = getItemsProcessingDefaults(
    worldLocalEnv.getDistributionMapDimensions(),
  )

  const itemsTaskHandler: ItemsProcessingTaskHandler = async (taskStub: ItemsProcessingTaskStub) => {
    // Misc utils

    const getPatchBounds = (input: Vector2 | PatchKey) => {
      const asPointBounds = (point: Vector2) => {
        const pointBounds = new Box2(point.clone(), point.clone())
        pointBounds.expandByScalar(1)
        return pointBounds
      }
      return input instanceof Vector2
        ? asPointBounds(input)
        : asPatchBounds(input, worldLocalEnv.getPatchDimensions())
    }

    const parseInput = (input: ItemsProcessingInput) => {
      return input instanceof Box2 ? input.clone() : getPatchBounds(input)
    }

    const retrieveItemBottomBlocks = async (itemChunk: ChunkContainer) => {
      const chunkBottomBlocks: Vector3[] = []
      const blocksTaskHandler = taskHandlers[blocksProcessingHandlerName]
      // iter slice blocks
      for (const heightBuff of itemChunk.iterChunkSlice()) {
        if (heightBuff.data[0]) chunkBottomBlocks.push(asVect3(heightBuff.pos, 0))
      }
      const blocksTask = BlocksProcessing.getGroundPositions(chunkBottomBlocks)
      blocksTask.processingParams.densityEval = true
      const blocksBatch = await blocksTask.process(blocksTaskHandler)
      // console.log(testBlock)
      return blocksBatch
    }

    /**
     * discard schematics above terrain holes + adjust chunk elevation on ground
     * @param itemChunk
     * @returns
     */
    const postprocessItemChunk = async (itemChunk: ChunkContainer) => {
      let isItemDiscarded = true
      const itemBottomBlocks = await retrieveItemBottomBlocks(itemChunk)
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
      return isItemDiscarded
    }

    // Task input processors

    /**
     * BakeIndividualChunks
     * needs: spawned items
     * provides: individual chunks
     */
    const bakeIndividualChunks = async (spawnedItems: SpawnedItems) => {
      // request all items belonging to this patch
      const individualChunks: ChunkContainer[] = []
      let ymin = NaN
      let ymax = NaN // compute y range
      for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
        for await (const spawnOrigin of spawnPlaces) {
          const itemChunk = await itemsInventory.getInstancedChunk(
            itemType,
            spawnOrigin,
          )
          if (itemChunk) {
            // ChunkContainer.copySourceToTarget(itemChunk, this)
            const { min, max } = itemChunk.bounds
            ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
            ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
            const isDiscarded = await postprocessItemChunk(itemChunk)
            !isDiscarded && individualChunks.push(itemChunk)
          }
        }
      }
      // const itemsRange = {
      //   ymin,
      //   ymax
      // }
      // this.bounds.min.y = ymin
      // this.bounds.max.y = ymax
      return individualChunks
    }

    /**
     * needs: individual items
     * provides: merged items chunk
     */
    const mergeIndividualChunks = (individualChunks: ChunkContainer[]) => {
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

    const queryPointPeakBlock = async (
      spawnedItems: SpawnedItems,
      requestedPos: Vector2,
    ) => {
      const peakBlock = {
        level: 0,
        type: BlockType.NONE,
      }
      for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
        for await (const spawnOrigin of spawnPlaces) {
          const templateChunk = await itemsInventory.getTemplateChunk(itemType)
          const shallowInstance = await itemsInventory.getInstancedChunk(
            itemType,
            spawnOrigin,
          )

          if (templateChunk && shallowInstance) {
            const localPos = shallowInstance.toLocalPos(asVect3(requestedPos))
            const dataArray = templateChunk.readBuffer(asVect2(localPos))
            dataArray.reverse()
            const index = dataArray.findIndex(val => !!val)

            if (index !== -1) {
              const peakBlockLevel = shallowInstance.bounds.max.y - index
              const rawData = dataArray[index]
              if (rawData && peakBlockLevel > peakBlock.level) {
                peakBlock.level = peakBlockLevel
                peakBlock.type = rawData || BlockType.NONE
              }
            }
          }
        }
      }
      return peakBlock
    }

    /**
     * needs: spawned items + requested pos (externally provided)
     * provides: items blocks at requested pos
     *
     * note: several spawned overlapping objects may be found at queried position
     */
    const queryPointBlocks = async (
      spawnedItems: SpawnedItems,
      requestedPos: Vector3,
    ) => {
      const mergeBuffer: number[] = []
      for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
        for await (const spawnOrigin of spawnPlaces) {
          const templateChunk = await itemsInventory.getTemplateChunk(itemType)
          const shallowInstance = await itemsInventory.getInstancedChunk(
            itemType,
            spawnOrigin,
          )

          if (templateChunk && shallowInstance) {
            const localPos = shallowInstance.toLocalPos(requestedPos)
            const yOffset = requestedPos.y - spawnOrigin.y
            const sliceSectorData = templateChunk.readBuffer(asVect2(localPos))
            const sourceOffset = Math.max(yOffset, 0)
            const targetOffset = -Math.min(yOffset, 0)
            sliceSectorData.slice(sourceOffset).forEach((val, i) => {
              const index = i + targetOffset
              while (mergeBuffer.length <= index) mergeBuffer.push(0)
              mergeBuffer[i + targetOffset] = val
            })
            // const sliceSectors = templateChunk.iterChunkSlice(location)
            // for (const sliceSector of sliceSectors) {
            //   sliceSectorData = sliceSector.data
            // }
          }
        }
      }
      return mergeBuffer
    }

    const retrieveOvergroundItems = (
      patchBounds: Box2,
      worldInstance: WorldModules,
    ) => {
      const groundPatch = new GroundPatch(patchBounds)
      groundPatch.prepare(worldInstance.biome)

      // take approximative item dimension until item type is known
      const spawnedItems: Record<ItemType, Vector3[]> = {}
      const spawnPlaces = defaults.spawnMap.querySpawnLocations(
        patchBounds,
        asVect2(defaults.itemDims),
      )
      for (const pos of spawnPlaces) {
        // console.log(pos)
        const { level, biome, landId } = groundPatch.computeGroundBlock(
          asVect3(pos),
          worldInstance,
        )
        // const blockProcessor = new BlockProcessor(asVect3(pos), groundPatch)
        // const floorBlock = blockProcessor.getFloorBlock()
        const { floraItems } =
          worldInstance.biome.getBiomeLandConf(biome, landId as string) || {}
        if (floraItems && floraItems?.length > 0) {
          const itemType = defaults.spawnMap.getSpawnedItem(
            pos,
            floraItems,
          ) as ItemType
          if (itemType && itemType !== VoidItemType) {
            spawnedItems[itemType] = spawnedItems[itemType] || []
            spawnedItems[itemType]?.push(asVect3(pos, level))
          }
        }
      }
      return spawnedItems
    }

    const { processingInput, processingParams } = taskStub
    const { recipe } = processingParams
    const patchBounds = parseInput(processingInput)
    const spawnedItems = retrieveOvergroundItems(patchBounds, worldModules)

    if (recipe === ItemsProcessingRecipe.SpawnedItems) {
      return spawnedItems
    } else if (recipe === ItemsProcessingRecipe.IsolatedPointBlocks) {
      if (processingInput instanceof Vector3) {
        return await queryPointBlocks(spawnedItems, processingInput)
      } else {
        console.warn(`invalid input provided for point query`)
        const emptyOutput: number[] = []
        return emptyOutput
      }
    } else if (recipe === ItemsProcessingRecipe.PointPeakBlock) {
      if (processingInput instanceof Vector2) {
        return await queryPointPeakBlock(spawnedItems, processingInput)
      } else {
        console.warn(`invalid input provided for point query`)
        const emptyOutput = { level: 0, type: BlockType.NONE }
        return emptyOutput
      }
    } else {
      const individualChunks = await bakeIndividualChunks(spawnedItems)
      if (recipe === ItemsProcessingRecipe.IndividualChunks) {
        return individualChunks.map(chunk => chunk.toStub())
      } else {
        const mergedItems = await mergeIndividualChunks(individualChunks)
        return mergedItems
      }
    }
  }
  return itemsTaskHandler
}


