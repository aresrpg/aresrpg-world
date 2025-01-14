import { Box2, Box3, Vector3 } from 'three'

import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer'
import {
  Biome,
  BlocksProcessing,
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

const defaultDistribution: DistributionParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}
const defaultSpawnMap = new PseudoDistributionMap(
  undefined,
  defaultDistribution,
)
const defaultItemDims = new Vector3(10, 13, 10)

type ItemsLayerStub = {
  spawnedItems: SpawnedItems
  individualChunks: ChunkContainer[]
}

const getPatchBounds = (boundsOrPatchKey: Box2 | PatchKey) => {
  const patchBounds =
    boundsOrPatchKey instanceof Box2
      ? boundsOrPatchKey.clone()
      : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
  // this.bounds = asBox3(patchBounds)
  // this.patch.bounds = patchBounds
  // if (typeof boundsOrPatchKey === 'string') {
  //   this.patchKey = boundsOrPatchKey
  // }
  return patchBounds
}

// takes
const adjustHeight = async (itemChunk: ChunkContainer) => {
  const chunkBottomBlocks: Vector3[] = []
  // iter slice blocks
  for (const heightBuff of itemChunk.iterChunkSlice()) {
    if (heightBuff.data[0]) chunkBottomBlocks.push(asVect3(heightBuff.pos, 0))
  }
  // compute blocks batch to find lowest element
  const blocksBatch = new BlocksProcessing(chunkBottomBlocks)
  const batchRes = await blocksBatch.process()
  const [lowestBlock] = batchRes.sort((b1, b2) => b1.data.level - b2.data.level)
  const lowestHeight = lowestBlock?.data.level || 0
  const heightOffset = itemChunk.bounds.min.y - lowestHeight
  // adjust chunk elevation according to lowest element
  itemChunk.bounds.translate(new Vector3(0, -heightOffset, 0))
}

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

/**
 * BakeIndividualChunks
 * needs: spawned items
 * provides: individual chunks
 */
export const bakeIndividualChunks = async (spawnedItems: SpawnedItems) => {
  // request all items belonging to this patch
  const individualChunks = []
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
        await adjustHeight(itemChunk)
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

/**
 * needs: spawned items + requested pos (externally provided)
 * provides: items blocks at requested pos
 *
 * note: several spawned overlapping objects may be found at queried position
 */
export const queryIndividualPos = async (
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

/**
 * Recipes
 * - spawnedItems
 * - individualChunks
 * - mergedItemsChunk
 * - pointQuery
 */

export enum ItemsProcessingRecipes {
  SpawnedItems = 'SpawnedItems',
  IndividualChunks = 'IndividualChunks',
  MergeIndividualChunks = 'MergeIndividualChunks',
  IsolatedPointQuery = 'IsolatedPointQuery',
}

const bakeRecipe = async (
  recipe: ItemsProcessingRecipes,
  boundsOrPatchKey: Box2 | PatchKey,
  requestedPos?: Vector3,
) => {
  const patchBounds = getPatchBounds(boundsOrPatchKey)
  const spawnedItems = retrieveOvergroundItems(patchBounds)
  if (recipe === ItemsProcessingRecipes.SpawnedItems) {
    return spawnedItems
  } else if (
    recipe === ItemsProcessingRecipes.IsolatedPointQuery &&
    requestedPos
  ) {
    return await queryIndividualPos(spawnedItems, requestedPos)
  } else {
    const individualChunks = await bakeIndividualChunks(spawnedItems)
    if (recipe === ItemsProcessingRecipes.IndividualChunks) {
      return individualChunks
    } else {
      const mergedItems = await mergeIndividualChunks(individualChunks)
      return mergedItems
    }
  }
}

export type ItemsProcessingParams = {
  recipe: ItemsProcessingRecipes
}

const defaultProcessingParams: ItemsProcessingParams = {
  recipe: ItemsProcessingRecipes.IndividualChunks,
}

const noParser = (stubs: any) => stubs
const chunkStubParser = (chunkStub: ChunkStub) =>
  new ChunkContainer().fromStub(chunkStub)
const chunkStubsParser = (stubs: ChunkStub[]) => stubs.map(chunkStubParser)

const stubsParsers: Record<ItemsProcessingRecipes, (stubs: any) => any> = {
  [ItemsProcessingRecipes.SpawnedItems]: noParser,
  [ItemsProcessingRecipes.IndividualChunks]: chunkStubsParser,
  [ItemsProcessingRecipes.MergeIndividualChunks]: chunkStubParser,
  [ItemsProcessingRecipes.IsolatedPointQuery]: noParser,
}

/**
 * Process all items found in given patch
 * rename as ItemsProcessing?
 */
export class ItemsBaker extends ProcessingTask {
  // bounds: Box3
  // patch: PatchStub = {
  //   bounds: new Box2(),
  // }
  mandatoryInputs: any[]
  optionalInputs: any[]
  // spawnedItems: SpawnedItems = {}
  // individualChunks: ChunkContainer[] = []

  constructor(boundsOrPatchKey: Box2 | PatchKey, requestedPos?: Vector3) {
    super()
    this.mandatoryInputs = [boundsOrPatchKey]
    this.optionalInputs = requestedPos ? [requestedPos] : []
    // const patchBounds =
    //   boundsOrPatchKey instanceof Box2
    //     ? boundsOrPatchKey.clone()
    //     : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
    // this.bounds = asBox3(patchBounds)
    // this.patch.bounds = patchBounds
    // if (typeof boundsOrPatchKey === 'string') {
    //   this.patchKey = boundsOrPatchKey
    // }
  }

  // get patchKey() {
  //   return this.patch.key || ''
  // }

  // set patchKey(patchKey: string) {
  //   this.patch.key = patchKey
  //   this.patch.id = parsePatchKey(patchKey) as Vector2
  // }

  // get patchId() {
  //   return this.patch.id
  // }

  override get inputs() {
    return [...this.mandatoryInputs, ...this.optionalInputs]
  }

  override reconcile(stubs: ItemsLayerStub) {
    // const { spawnedItems, individualChunks } = stubs
    // // fill object from worker's data
    // this.spawnedItems = spawnedItems
    // this.individualChunks = individualChunks || this.individualChunks

    // parse stubs
    const { recipe } = this.processingParams as ItemsProcessingParams
    const stubsParser = stubsParsers[recipe]
    return stubsParser(stubs)
  }

  override async process(processingParams = defaultProcessingParams) {
    const { recipe } = processingParams
    const [input] = this.mandatoryInputs
    return bakeRecipe(recipe, input)
  }

  async bakeIndividualChunks() {
    const [mandatory] = this.mandatoryInputs
    return (await bakeRecipe(
      ItemsProcessingRecipes.IndividualChunks,
      mandatory,
    )) as ChunkContainer[]
  }

  async mergeIndividualChunks() {
    const [mandatory] = this.mandatoryInputs
    return (await bakeRecipe(
      ItemsProcessingRecipes.MergeIndividualChunks,
      mandatory,
    )) as ChunkContainer
  }

  async queryIsolatedPoint() {
    const [mandatory] = this.mandatoryInputs
    const [optional] = this.optionalInputs
    return (await bakeRecipe(
      ItemsProcessingRecipes.IsolatedPointQuery,
      mandatory,
      optional,
    )) as number[]
  }

  // toStub() {
  //   const { spawnedItems } = this
  //   // return { spawnedItems, individualChunks }
  //   return { spawnedItems }
  // }

  // get patchBounds() {
  //   return asBox2(this.bounds)
  // }

  // get spawnedLocs() {
  //   const spawnedLocs = []
  //   for (const [, spawnPlaces] of Object.entries(this.spawnedItems)) {
  //     spawnedLocs.push(...spawnPlaces)
  //   }
  //   return spawnedLocs
  // }
}

ProcessingTask.registeredObjects[ItemsBaker.name] = ItemsBaker
