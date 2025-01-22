import { Box2, Box3, Vector2, Vector3 } from 'three'

import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer'
import {
  Biome,
  BlockType,
  DistributionProfile,
  ProcessingTask,
  PseudoDistributionMap,
} from '../index'
import { DistributionParams } from '../procgen/BlueNoisePattern'
import { asPatchBounds, asVect2, asVect3 } from '../utils/convert'
import { PatchKey } from '../utils/types'
import { WorldEnv } from '../config/WorldEnv'
import { ItemsInventory, ItemType, SpawnedItems } from '../factory/ItemsFactory'

import { GroundPatch } from './GroundPatch'
import { DistributionProfiles } from './RandomDistributionMap'
import {
  GenericTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing'

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

export const itemsProcessingTaskHandler: ItemsProcessingTaskHandler = async (
  taskStub: ItemsProcessingTaskStub,
) => {
  const { processingInput, processingParams } = taskStub
  const { recipe } = processingParams
  const patchBounds = parseInput(processingInput)
  const spawnedItems = retrieveOvergroundItems(patchBounds)

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

// Registration
ProcessingTask.taskHandlers[itemsProcessingHandlerName] =
  itemsProcessingTaskHandler

/**
 * Processing
 */

// Defaults

const defaultDistribution: DistributionParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}
const defaultSpawnMap = new PseudoDistributionMap(
  undefined,
  defaultDistribution,
)
const defaultItemDims = new Vector3(10, 13, 10)

// Misc utils

const getPatchBounds = (input: Vector2 | PatchKey) => {
  const asPointBounds = (point: Vector2) => {
    const pointBounds = new Box2(point.clone(), point.clone())
    pointBounds.expandByScalar(1)
    return pointBounds
  }
  return input instanceof Vector2
    ? asPointBounds(input)
    : asPatchBounds(input, WorldEnv.current.patchDimensions)
}

const parseInput = (input: ItemsProcessingInput) => {
  return input instanceof Box2 ? input.clone() : getPatchBounds(input)
}

export const isChunksProcessingTask = (task: GenericTask) =>
  task.handlerId === itemsProcessingHandlerName

// // takes
// const adjustItemHeight = async (itemChunk: ChunkContainer) => {
//   const chunkBottomBlocks: Vector3[] = []
//   // iter slice blocks
//   for (const heightBuff of itemChunk.iterChunkSlice()) {
//     if (heightBuff.data[0]) chunkBottomBlocks.push(asVect3(heightBuff.pos, 0))
//   }
//   // compute blocks batch to find lowest element
//   const blocksBatch = await BlocksProcessing.getFloorPositions(chunkBottomBlocks).process()
//   const [lowestBlock] = blocksBatch.sort((b1, b2) => b1.data.level - b2.data.level)
//   const lowestHeight = lowestBlock?.data.level || 0
//   const heightOffset = itemChunk.bounds.min.y - lowestHeight
//   // adjust chunk elevation according to lowest element
//   itemChunk.bounds.translate(new Vector3(0, -heightOffset, 0))
// }

/**
 * retrieveOvergroundItems
 * needs: patchBounds (externally provided)
 * provides: spawned items
 */
export const retrieveOvergroundItems = (patchBounds: Box2) => {
  const groundPatch = new GroundPatch(patchBounds)
  groundPatch.preprocess()

  // take approximative item dimension until item type is known
  const spawnedItems: Record<ItemType, Vector3[]> = {}
  const spawnPlaces = defaultSpawnMap.querySpawnLocations(
    patchBounds,
    asVect2(defaultItemDims),
  )
  for (const pos of spawnPlaces) {
    // console.log(pos)
    const { level, biome, landId } = groundPatch.computeGroundBlock(
      asVect3(pos),
    )
    // const blockProcessor = new BlockProcessor(asVect3(pos), groundPatch)
    // const floorBlock = blockProcessor.getFloorBlock()
    const { floraItems } =
      Biome.instance.getBiomeLandConf(biome, landId as string) || {}
    if (floraItems && floraItems?.length > 0) {
      const itemType = defaultSpawnMap.getSpawnedItem(
        pos,
        floraItems,
      ) as ItemType
      if (itemType) {
        spawnedItems[itemType] = spawnedItems[itemType] || []
        spawnedItems[itemType]?.push(asVect3(pos, level))
      }
    }
  }
  return spawnedItems
}

// Task input processors

/**
 * BakeIndividualChunks
 * needs: spawned items
 * provides: individual chunks
 */
export const bakeIndividualChunks = async (spawnedItems: SpawnedItems) => {
  // request all items belonging to this patch
  const individualChunks: ChunkContainer[] = []
  let ymin = NaN
  let ymax = NaN // compute y range
  for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
    for await (const spawnOrigin of spawnPlaces) {
      const itemChunk = await ItemsInventory.getInstancedChunk(
        itemType,
        spawnOrigin,
      )
      if (itemChunk) {
        // ChunkContainer.copySourceToTarget(itemChunk, this)
        const { min, max } = itemChunk.bounds
        ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
        ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
        // await adjustHeight(itemChunk)
        individualChunks.push(itemChunk)
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
export const mergeIndividualChunks = (individualChunks: ChunkContainer[]) => {
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

export const queryPointPeakBlock = async (
  spawnedItems: SpawnedItems,
  requestedPos: Vector2,
) => {
  const peakBlock = {
    level: 0,
    type: BlockType.NONE,
  }
  for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
    for await (const spawnOrigin of spawnPlaces) {
      const templateChunk = await ItemsInventory.getTemplateChunk(itemType)
      const shallowInstance = await ItemsInventory.getInstancedChunk(
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
          const preEncodedData = dataArray[index]
          if (preEncodedData && peakBlockLevel > peakBlock.level) {
            peakBlock.level = peakBlockLevel
            peakBlock.type =
              ChunkContainer.dataDecoder(preEncodedData) || BlockType.NONE
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
export const queryPointBlocks = async (
  spawnedItems: SpawnedItems,
  requestedPos: Vector3,
) => {
  const mergeBuffer: number[] = []
  for await (const [itemType, spawnPlaces] of Object.entries(spawnedItems)) {
    for await (const spawnOrigin of spawnPlaces) {
      const templateChunk = await ItemsInventory.getTemplateChunk(itemType)
      const shallowInstance = await ItemsInventory.getInstancedChunk(
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
