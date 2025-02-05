import { WorldEnv } from '../config/WorldEnv'
import { asVect3, serializeChunkId } from '../utils/patch_chunk'
import { PatchId, PatchKey } from '../utils/common_types'
import {
  ChunkContainer,
  ChunkStub,
  defaultDataEncoder,
} from '../datacontainers/ChunkContainer'
import { CavesMask, EmptyChunk, GroundChunk } from '../factory/ChunksFactory'

import { GroundPatch } from './GroundPatch'
import {
  GenericTask,
  ProcessingTask,
  ProcessingTaskHandler,
  ProcessingTaskStub,
} from './TaskProcessing'
import { ItemsProcessing } from './ItemsProcessing'

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
  noDataEncoding?: boolean
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
  allChunks: getChunksTask(ChunksProcessingRange.FullRange),
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
  ChunkStub[] | Blob[]
>

export const chunksProcessingTaskHandler: ChunksProcessingTaskHandler = async (
  taskStub: ChunksProcessingTaskStub,
) => {
  const { processingInput, processingParams } = taskStub
  const { patchKey } = processingInput
  const { chunksRange, skipBlobCompression } = processingParams
  const doLower =
    chunksRange === ChunksProcessingRange.LowerRange ||
    chunksRange === ChunksProcessingRange.FullRange
  const doUpper =
    chunksRange === ChunksProcessingRange.UpperRange ||
    chunksRange === ChunksProcessingRange.FullRange
  const lowerChunks = doLower
    ? await lowerChunksGen(patchKey, processingParams)
    : []
  const upperChunks = doUpper
    ? await upperChunksGen(patchKey, processingParams)
    : []
  const chunks = [...lowerChunks, ...upperChunks]
  return skipBlobCompression
    ? chunks.map(chunk => chunk.toStub())
    : await Promise.all(chunks.map(chunk => chunk.toCompressedBlob()))
}

// Registration
ProcessingTask.taskHandlers[chunksProcessingHandlerName] =
  chunksProcessingTaskHandler

/**
 * Processing
 */

const chunksRange = WorldEnv.current.chunks.range
const { patchDimensions: patchDims } = WorldEnv.current

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
  const { skipEntities, noDataEncoding } = params
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
      const customEncoder = noDataEncoding ? defaultDataEncoder : undefined
      const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
      const cavesMask = new CavesMask(chunkKey, 1)
      cavesMask.bake()
      await groundSurfaceChunk.bake(groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
    }
    upperChunks.push(worldChunk)
  }

  // remaining chunks: empty chunks start 1 chunk above ground surface
  for (let y = surfaceIds.yMaxId + 1; y <= chunksRange.topId; y++) {
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
const lowerChunksGen = async (
  patchKey: PatchKey,
  params: ChunksProcessingParams,
) => {
  const { noDataEncoding } = params
  // find upper chunkId
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.bake()
  const patchId = groundLayer.patchId as PatchId
  const upperId = Math.floor(groundLayer.valueRange.min / patchDims.y) - 1
  const lowerChunks = []
  // then iter until bottom is reached
  for (let yId = upperId; yId >= chunksRange.bottomId; yId--) {
    const chunkId = asVect3(patchId, yId)
    const chunkKey = serializeChunkId(chunkId)
    const currentChunk = new ChunkContainer(chunkKey, 1)
    const customEncoder = noDataEncoding ? defaultDataEncoder : undefined
    const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
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
