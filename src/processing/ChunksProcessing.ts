import {
  asVect3,
  parsePatchKey,
  serializeChunkId,
} from '../utils/patch_chunk.js'
import { PatchId, PatchKey } from '../utils/common_types.js'
import { ChunkContainer, ChunkStub } from '../datacontainers/ChunkContainer.js'
import { CavesMask, EmptyChunk, GroundChunk } from '../factory/ChunksFactory.js'
import { chunksToCompressedBlob } from '../utils/chunk_utils.js'
import { WorldModules } from '../WorldModules.js'

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
  fakeEmpty?: boolean
}

type TaskOptions = ChunksProcessingParams & {
  onStarted?: (...a: any) => any
  onCompleted?: (...a: any) => any
  onRejected?: (error: string) => any
}

// constructor
const ChunksProcessingTaskConstructor = ProcessingTask<
  ChunksProcessingInput,
  ChunksProcessingParams,
  ChunksProcessingOutput
>

const getChunksTask =
  (chunksRange: ChunksProcessingRange) =>
  (patchKey: PatchKey, processingOptions: TaskOptions = {}) => {
    const task = new ChunksProcessingTaskConstructor()
    task.handlerId = chunksProcessingHandlerName
    task.processingInput = { patchKey }
    task.processingParams = { chunksRange }
    task.postProcess = postProcess

    const { onStarted, onCompleted, onRejected, ...processingParams } =
      processingOptions

    Object.assign(task.processingParams, processingParams)
    if (onStarted) task.onStarted = onStarted
    if (onCompleted) task.onCompleted = onCompleted
    if (onRejected) task.onRejected = onRejected

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

export const chunksProcessingTaskHandler: ChunksProcessingTaskHandler = async (
  taskStub: ChunksProcessingTaskStub,
  worldModules: WorldModules,
) => {
  const { worldLocalEnv } = worldModules
  /**
   * Chunks above ground surface including overground items & empty chunks
   */
  const upperChunksGen = async (
    patchKey: PatchKey,
    params: ChunksProcessingParams,
  ) => {
    const patchDim = worldLocalEnv.getPatchDimensions()
    const chunkDim = worldLocalEnv.getChunkDimensions()
    const chunksVerticalRange = worldLocalEnv.getChunksVerticalRange()
    const { skipEntities } = params
    const groundLayer = GroundPatch.fromKey(patchKey, patchDim)
    groundLayer.bake(worldModules)
    const patchId = groundLayer.patchId as PatchId
    const upperChunks: ChunkContainer[] = []
    // compute chunk id range
    let yMin = groundLayer.valueRange.min
    let yMax = groundLayer.valueRange.max

    let mergedItemsChunk
    if (!skipEntities) {
      const itemsMerging =
        await ItemsProcessing.mergeIndividualChunks(patchKey).process(
          worldModules,
        )
      mergedItemsChunk = itemsMerging as ChunkContainer // .mergedChunk
      if (mergedItemsChunk) {
        // adjust chunks range accordingly
        yMin = Math.min(mergedItemsChunk.bounds.min.y, yMin)
        yMax = Math.max(mergedItemsChunk.bounds.max.y, yMax)
      }
    }

    const surfaceIds = {
      yMinId: Math.floor(yMin / patchDim.y),
      yMaxId: Math.floor(yMax / patchDim.y),
    }

    // gen each surface chunk in range
    for (let yId = surfaceIds.yMinId; yId <= surfaceIds.yMaxId; yId++) {
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const worldChunk = new ChunkContainer(undefined, 1).fromKey(
        chunkKey,
        chunkDim,
      )
      // copy items layer first to prevent overriding ground
      mergedItemsChunk &&
        ChunkContainer.copySourceToTarget(mergedItemsChunk, worldChunk)
      if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
        // bake ground and undeground separately
        const groundSurfaceChunk = new GroundChunk(undefined, 1).fromKey(
          chunkKey,
          chunkDim,
        )
        const cavesMask = new CavesMask(undefined, 1).fromKey(
          chunkKey,
          chunkDim,
        )
        cavesMask.bake(worldModules)
        await groundSurfaceChunk.bake(worldModules, groundLayer, cavesMask)
        // copy ground over items at last
        ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
      }
      upperChunks.push(worldChunk)
    }

    // remaining chunks: empty chunks start 1 chunk above ground surface
    for (let y = surfaceIds.yMaxId + 1; y <= chunksVerticalRange.topId; y++) {
      const chunkId = asVect3(patchId, y)
      const chunkKey = serializeChunkId(chunkId)
      const emptyChunk = new EmptyChunk(chunkKey, chunkDim)
      upperChunks.push(emptyChunk)
    }
    return upperChunks
  }

  /**
   * Chunks below ground surface
   */
  const lowerChunksGen = async (patchKey: PatchKey) => {
    const patchDim = worldLocalEnv.getPatchDimensions()
    const chunkDim = worldLocalEnv.getChunkDimensions()
    const chunksVerticalRange = worldLocalEnv.getChunksVerticalRange()
    // find upper chunkId
    const groundLayer = GroundPatch.fromKey(patchKey, patchDim)
    groundLayer.bake(worldModules)
    const patchId = groundLayer.patchId as PatchId
    const upperId = Math.floor(groundLayer.valueRange.min / patchDim.y) - 1
    const lowerChunks = []
    // then iter until bottom is reached
    for (let yId = upperId; yId >= chunksVerticalRange.bottomId; yId--) {
      const chunkId = asVect3(patchId, yId)
      const chunkKey = serializeChunkId(chunkId)
      const currentChunk = new ChunkContainer(undefined, 1).fromKey(
        chunkKey,
        chunkDim,
      )
      const groundSurfaceChunk = new GroundChunk(undefined, 1).fromKey(
        chunkKey,
        chunkDim,
      )
      const cavesMask = new CavesMask(undefined, 1).fromKey(chunkKey, chunkDim)
      cavesMask.bake(worldModules)
      await groundSurfaceChunk.bake(worldModules, groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, currentChunk)
      lowerChunks.push(currentChunk)
    }
    // console.log(
    //   `processed undeground chunkset: ${this.printChunkset(undergoundChunks)}`,
    // )
    return lowerChunks
  }

  const addFakeEmptyChunks = (patchKey: PatchKey, chunks: ChunkContainer[]) => {
    const chunkDim = worldLocalEnv.getChunkDimensions()
    const chunksRange = worldLocalEnv.getChunksVerticalRange()
    const patchId = parsePatchKey(patchKey) as PatchId
    // remaining chunks: empty chunks start 1 chunk above ground surface
    for (let y = chunksRange.bottomId; y <= chunksRange.topId; y++) {
      const chunkId = asVect3(patchId, y)
      const chunkKey = serializeChunkId(chunkId)
      const found = chunks.find(chunk => chunk.chunkKey === chunkKey)
      if (!found) {
        const emptyChunk = new EmptyChunk(chunkKey, chunkDim)
        chunks.push(emptyChunk)
      }
    }
  }

  const { processingInput, processingParams } = taskStub
  const { patchKey } = processingInput
  const { chunksRange, skipBlobCompression, fakeEmpty } = processingParams
  const doLower =
    chunksRange === ChunksProcessingRange.LowerRange ||
    chunksRange === ChunksProcessingRange.FullRange
  const doUpper =
    chunksRange === ChunksProcessingRange.UpperRange ||
    chunksRange === ChunksProcessingRange.FullRange
  const lowerChunks = doLower ? await lowerChunksGen(patchKey) : []
  const upperChunks = doUpper
    ? await upperChunksGen(patchKey, processingParams)
    : []

  const chunks = [...lowerChunks, ...upperChunks]
  if (fakeEmpty && chunksRange !== ChunksProcessingRange.FullRange) {
    addFakeEmptyChunks(patchKey, chunks)
  }
  return skipBlobCompression
    ? chunks.map(chunk => chunk.toStub())
    : await chunksToCompressedBlob(chunks)
}

// Registration
ProcessingTask.taskHandlers[chunksProcessingHandlerName] =
  chunksProcessingTaskHandler

/**
 * Processing
 */

// Misc utils

export const isChunksProcessingTask = (task: GenericTask) =>
  task.handlerId === chunksProcessingHandlerName

// Task input processors

const postProcess = (rawData: ChunkStub[]) => {
  // postprocess raw data from task to recreate chunks
  // const chunks = rawData.map((chunkStub: ChunkStub) =>
  //   ChunkContainer.fromStub(chunkStub),
  // )
  return rawData // chunks
}

// const printChunkset = (chunkset: ChunkContainer[]) =>
//   chunkset.reduce((concat, chunk) => concat + chunk.chunkKey + ', ', '')
