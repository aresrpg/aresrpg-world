import { worldEnv } from '../config/WorldEnv.js'
import { asVect3, serializeChunkId } from '../utils/patch_chunk.js'
import { PatchId, PatchKey } from '../utils/common_types.js'
import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer.js'
import { CavesMask, EmptyChunk, GroundChunk } from '../factory/ChunksFactory.js'
import { chunksToCompressedBlob } from '../utils/chunk_utils.js'

import { GroundPatch } from './GroundPatch.js'
import {
  GenericTask,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing.js'
import { ItemsProcessing } from './ItemsProcessing.js'

/**
 * Calling side
 */

export const chunksProcessingHandlerName = `ChunksProcessing`

export enum ChunksProcessingRange {
  LowerRange = `lower_range`,
  UpperRange = `upper_range`,
  FullRange = `full_range`,
}

export type ChunksProcessingInput = {
  patchKey: PatchKey
}
export type ChunksProcessingOutput = ChunkStub[]
export type ChunksProcessingParams = {
  skipEntities?: boolean
  chunksRange?: ChunksProcessingRange
  skipBlobCompression?: boolean
}

// constructor
const ChunksProcessingTaskConstructor = ProcessingTask<
  ChunksProcessingInput,
  ChunksProcessingParams,
  ChunksProcessingOutput
>

const getChunksTask =
  (chunksRange: ChunksProcessingRange) => (patchKey: PatchKey) => {
    const task = new ChunksProcessingTaskConstructor()
    task.handlerId = chunksProcessingHandlerName
    task.processingInput = { patchKey }
    task.processingParams = { chunksRange }
    task.postProcess = postProcess
    return task
  }

// Exposed API

export const ChunksProcessing = {
  lowerChunks: getChunksTask(ChunksProcessingRange.LowerRange),
  upperChunks: getChunksTask(ChunksProcessingRange.UpperRange),
  fullChunks: getChunksTask(ChunksProcessingRange.FullRange),
}

/**
 * Handling side
 */

export type ChunksProcessingTask = ProcessingTask<
  ChunksProcessingInput,
  ChunksProcessingParams,
  ChunksProcessingOutput
>
type ChunksProcessingTaskStub = ProcessingTaskStub<
  ChunksProcessingInput,
  ChunksProcessingParams
>
type ChunksProcessingTaskHandler = ProcessingTaskHandler<
  ChunksProcessingInput,
  ChunksProcessingParams,
  ChunkStub[] | Blob
>

// Helper function to extract the y-coordinate ID from a chunk key
function extractYIdFromChunk(chunkKey: string): number {
  // For a chunk key format 'chunk_x_y_z', extract the y component
  const [, , y] = chunkKey.split('_')
  return Number(y)
}

/**
 * Processing
 */

const patchDims = worldEnv.getPatchDimensions()

export const chunksProcessingTaskHandler: ChunksProcessingTaskHandler = async (
  taskStub: ChunksProcessingTaskStub,
) => {
  const { processingInput, processingParams } = taskStub
  const { patchKey } = processingInput
  const { chunksRange, skipBlobCompression } = processingParams

  // Get the ground layer to determine patchId
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.bake()
  const patchId = groundLayer.patchId as PatchId

  // Determine which ranges to process based on request
  const doLower =
    chunksRange === ChunksProcessingRange.LowerRange ||
    chunksRange === ChunksProcessingRange.FullRange
  const doUpper =
    chunksRange === ChunksProcessingRange.UpperRange ||
    chunksRange === ChunksProcessingRange.FullRange

  // Generate requested chunks
  const lowerChunks = doLower ? await lowerChunksGen(patchKey) : []
  const upperChunks = doUpper
    ? await upperChunksGen(patchKey, processingParams)
    : []

  // Create a map of existing chunks by their y-coordinate ID
  const chunksByYId = new Map<number, ChunkContainer>()

  // Add lower chunks to the map
  lowerChunks.forEach(chunk => {
    const yId = extractYIdFromChunk(chunk.chunkKey)
    chunksByYId.set(yId, chunk)
  })

  // Add upper chunks to the map
  upperChunks.forEach(chunk => {
    const yId = extractYIdFromChunk(chunk.chunkKey)
    chunksByYId.set(yId, chunk)
  })

  // Create the full range array with all chunks
  const fullRangeChunks: ChunkContainer[] = []
  const { bottomId, topId } = worldEnv.rawSettings.chunks.range

  // Fill the range from bottom to top with existing chunks or empty ones
  for (let yId = bottomId; yId <= topId; yId++) {
    if (chunksByYId.has(yId)) {
      // Use existing chunk
      fullRangeChunks.push(chunksByYId.get(yId)!)
    } else {
      // Create empty chunk
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      fullRangeChunks.push(new EmptyChunk(chunkKey))
    }
  }

  return skipBlobCompression
    ? fullRangeChunks.map(chunk => chunk.toStub())
    : await chunksToCompressedBlob(fullRangeChunks)
}

// Registration
ProcessingTask.taskHandlers[chunksProcessingHandlerName] =
  chunksProcessingTaskHandler

// Misc utils

export const isChunksProcessingTask = (task: GenericTask) =>
  task.handlerId === chunksProcessingHandlerName

// Task input processors
/**
 * Chunks above ground surface including overground items & empty chunks
 */
const upperChunksGen = async (
  patchKey: PatchKey,
  params: ChunksProcessingParams,
) => {
  const { skipEntities } = params
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.bake()
  const patchId = groundLayer.patchId as PatchId
  const upperChunks: ChunkContainer[] = []
  // compute chunk id range
  let yMin = groundLayer.valueRange.min
  let yMax = groundLayer.valueRange.max

  let mergedItemsChunk
  if (!skipEntities) {
    const itemsMerging =
      await ItemsProcessing.mergeIndividualChunks(patchKey).process()
    mergedItemsChunk = itemsMerging as ChunkContainer // .mergedChunk
    if (mergedItemsChunk) {
      // adjust chunks range accordingly
      yMin = Math.min(mergedItemsChunk.bounds.min.y, yMin)
      yMax = Math.max(mergedItemsChunk.bounds.max.y, yMax)
    }
  }

  const surfaceIds = {
    yMinId: Math.floor(yMin / patchDims.y),
    yMaxId: Math.floor(yMax / patchDims.y),
  }

  // gen each surface chunk in range
  for (let yId = surfaceIds.yMinId; yId <= surfaceIds.yMaxId; yId++) {
    const chunkId = asVect3(patchId, yId)
    const chunkKey = serializeChunkId(chunkId)
    const worldChunk = new ChunkContainer(chunkKey, 1)
    // copy items layer first to prevent overriding ground
    mergedItemsChunk &&
      ChunkContainer.copySourceToTarget(mergedItemsChunk, worldChunk)
    if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
      // bake ground and undeground separately
      const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
      const cavesMask = new CavesMask(chunkKey, 1)
      cavesMask.bake()
      await groundSurfaceChunk.bake(groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
    }
    upperChunks.push(worldChunk)
  }

  // remaining chunks: empty chunks start 1 chunk above ground surface
  for (
    let y = surfaceIds.yMaxId + 1;
    y <= worldEnv.rawSettings.chunks.range.topId;
    y++
  ) {
    const chunkId = asVect3(patchId, y)
    const chunkKey = serializeChunkId(chunkId)
    const emptyChunk = new EmptyChunk(chunkKey)
    upperChunks.push(emptyChunk)
  }
  return upperChunks
}

/**
 * Chunks below ground surface
 */
const lowerChunksGen = async (patchKey: PatchKey) => {
  // find upper chunkId
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.bake()
  const patchId = groundLayer.patchId as PatchId
  const upperId = Math.floor(groundLayer.valueRange.min / patchDims.y) - 1
  const lowerChunks = []
  // then iter until bottom is reached
  for (
    let yId = upperId;
    yId >= worldEnv.rawSettings.chunks.range.bottomId;
    yId--
  ) {
    const chunkId = asVect3(patchId, yId)
    const chunkKey = serializeChunkId(chunkId)
    const currentChunk = new ChunkContainer(chunkKey, 1)
    const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
    const cavesMask = new CavesMask(chunkKey, 1)
    cavesMask.bake()
    await groundSurfaceChunk.bake(groundLayer, cavesMask)
    // copy ground over items at last
    ChunkContainer.copySourceToTarget(groundSurfaceChunk, currentChunk)
    lowerChunks.push(currentChunk)
  }
  // console.log(
  //   `processed undeground chunkset: ${this.printChunkset(undergoundChunks)}`,
  // )
  return lowerChunks
}

const postProcess = (rawData: ChunkStub[]) => {
  // postprocess raw data from task to recreate chunks
  // const chunks = rawData.map((chunkStub: ChunkStub) =>
  //   ChunkContainer.fromStub(chunkStub),
  // )
  return rawData // chunks
}

// const printChunkset = (chunkset: ChunkContainer[]) =>
//   chunkset.reduce((concat, chunk) => concat + chunk.chunkKey + ', ', '')
