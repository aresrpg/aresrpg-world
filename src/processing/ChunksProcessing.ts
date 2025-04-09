import { asVect3, parsePatchKey, serializeChunkId } from '../utils/patch_chunk.js'
import { PatchId, PatchKey } from '../utils/common_types.js'
import { CavesMask, GroundChunk } from '../factory/ChunksFactory.js'
import { chunksToCompressedBlob } from '../utils/chunk_utils.js'
import { WorldModules } from '../factory/WorldModules.js'
import { ChunkContainer, ChunkDataContainer, ChunkDataStub, ChunkMetadata } from '../datacontainers/ChunkContainer.js'

import { GroundPatch } from './GroundPatch.js'
import { AsyncProcessingTaskHandler, BaseProcessingParams, ProcessingTask, ProcessingTaskStub } from './TaskProcessing.js'
import { ItemsTask } from './ItemsProcessing.js'

/**
 * Calling side
 */

export enum ChunksProcessingRange {
    LowerRange = `lower_range`,
    UpperRange = `upper_range`,
    FullRange = `full_range`,
}

export type ChunksProcessingParams = BaseProcessingParams & {
    chunksRange?: ChunksProcessingRange
    skipEntities?: boolean
    skipBlobCompression?: boolean
    skipEmpty?: boolean
    fakeEmpty?: boolean
}

type TaskOptions = ChunksProcessingParams & {
    onStarted?: (...a: any) => any
    onCompleted?: (...a: any) => any
    onRejected?: (error: string) => any
}
export class ChunksTask extends ProcessingTask<PatchKey, ChunksProcessingParams, ChunkDataStub<ChunkMetadata>[]> {
    static handlerId = 'ChunksProcessing'

    constructor() {
        super(ChunksTask.handlerId)
    }

    /**
     * Build templates for most common tasks, adjust manually if needed
     */

    /**
     * Instance version (allow use from child classes)
     * @param chunksRange
     * @returns
     */

    getBuildTemplate(chunksRange: ChunksProcessingRange) {
        this.processingParams.chunksRange = chunksRange
        return (input: PatchKey) => {
            this.processingInput = input
            return this
        }
    }

    get lowerChunks() {
        return this.getBuildTemplate(ChunksProcessingRange.LowerRange)
    }

    get upperChunks() {
        return this.getBuildTemplate(ChunksProcessingRange.UpperRange)
    }

    get fullChunks() {
        return this.getBuildTemplate(ChunksProcessingRange.FullRange)
    }

    /**
     * Static versions (allow better types inferance)
     * @param chunksRange
     * @returns
     */

    static factory =
        (chunksRange: ChunksProcessingRange) =>
            (patchKey: PatchKey, processingOptions: TaskOptions = {}) => {
                const task = new ChunksTask()
                task.handlerId = this.handlerId
                task.processingInput = patchKey
                task.processingParams = { chunksRange }

                const { onStarted, onCompleted, onRejected, ...processingParams } = processingOptions

                Object.assign(task.processingParams, processingParams)
                if (onStarted) task.onStarted = onStarted
                if (onCompleted) task.onCompleted = onCompleted
                if (onRejected) task.onRejected = onRejected

                return task
            }

    static get lowerChunks() {
        return this.factory(ChunksProcessingRange.LowerRange)
    }

    static get upperChunks() {
        return this.factory(ChunksProcessingRange.UpperRange)
    }

    static get fullChunks() {
        return this.factory(ChunksProcessingRange.FullRange)
    }
}

// kept for backward compatibility with previous API (TODO: remove)
export const ChunksProcessing = ChunksTask

/**
 * Handling side
 */

type ChunksTaskStub = ProcessingTaskStub<PatchKey, ChunksProcessingParams>

type ChunksProcessingHandler = AsyncProcessingTaskHandler<PatchKey, ChunksProcessingParams, ChunkDataStub<ChunkMetadata>[] | Blob>

export const createChunksTaskHandler = (worldModules: WorldModules) => {
    const { worldLocalEnv, taskHandlers } = worldModules
    const chunksTaskHandler: ChunksProcessingHandler = async (taskStub: ChunksTaskStub) => {
        /**
         * Chunks above ground surface including overground items & empty chunks
         */
        const upperChunksGen = (patchKey: PatchKey, params: ChunksProcessingParams) => {
            const patchDim = worldLocalEnv.getPatchDimensions()
            const chunkDim = worldLocalEnv.getChunkDimensions()
            const chunksVerticalRange = worldLocalEnv.getChunksVerticalRange()
            const { skipEntities, skipEmpty } = params
            const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
            groundLayer.bake(worldModules)
            const patchId = groundLayer.patchId as PatchId
            const upperChunks: ChunkDataContainer[] = []
            // compute chunk id range
            let yMin = groundLayer.valueRange.min
            let yMax = groundLayer.valueRange.max

            const mergedChunk = skipEntities ? null : ItemsTask.mergedSpawnChunk(patchKey).process(taskHandlers) as ChunkDataContainer
            if (mergedChunk) {
                // adjust chunks range accordingly
                yMin = Math.min(mergedChunk.bounds.min.y, yMin)
                yMax = Math.max(mergedChunk.bounds.max.y, yMax)
            }
            const surfaceIds = {
                yMinId: Math.floor(yMin / patchDim.y),
                yMaxId: Math.floor(yMax / patchDim.y),
            }

            // gen each surface chunk in range
            for (let yId = surfaceIds.yMinId; yId <= surfaceIds.yMaxId; yId++) {
                const chunkId = asVect3(patchId, yId)
                const chunkKey = serializeChunkId(chunkId)
                const worldChunk = new ChunkDataContainer(undefined, 1).fromKey(chunkKey, chunkDim)
                // copy items layer first to prevent overriding ground
                mergedChunk && mergedChunk.copyContentToTarget(worldChunk)

                if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
                    // bake ground and undeground separately
                    const groundSurfaceChunk = new GroundChunk(undefined, 1).fromKey(chunkKey, chunkDim)
                    const cavesMask = new CavesMask(undefined, 1).fromKey(chunkKey, chunkDim)
                    cavesMask.bake(worldModules)
                    groundSurfaceChunk.bake(worldModules, groundLayer, cavesMask)
                    // copy ground over items at last
                    groundSurfaceChunk.copyContentToTarget(worldChunk)
                }
                upperChunks.push(worldChunk)
            }

            // remaining chunks: empty chunks start 1 chunk above ground surface
            if (!skipEmpty) {
                for (let y = surfaceIds.yMaxId + 1; y <= chunksVerticalRange.topId; y++) {
                    const chunkId = asVect3(patchId, y)
                    const chunkKey = serializeChunkId(chunkId)
                    const emptyChunk = new ChunkContainer(undefined, 1).fromKey(chunkKey, chunkDim)
                    upperChunks.push(emptyChunk as ChunkDataContainer)
                }
            }
            return upperChunks
        }

        /**
         * Chunks below ground surface
         */
        const lowerChunksGen = (patchKey: PatchKey) => {
            const patchDim = worldLocalEnv.getPatchDimensions()
            const chunkDim = worldLocalEnv.getChunkDimensions()
            const chunksVerticalRange = worldLocalEnv.getChunksVerticalRange()
            // find upper chunkId
            const groundLayer = new GroundPatch().fromKey(patchKey, patchDim, 1)
            groundLayer.bake(worldModules)
            const patchId = groundLayer.patchId as PatchId
            const upperId = Math.floor(groundLayer.valueRange.min / patchDim.y) - 1
            const lowerChunks = []
            // then iter until bottom is reached
            for (let yId = upperId; yId >= chunksVerticalRange.bottomId; yId--) {
                const chunkId = asVect3(patchId, yId)
                const chunkKey = serializeChunkId(chunkId)
                const currentChunk = new ChunkDataContainer(undefined, 1).fromKey(chunkKey, chunkDim)
                const groundSurfaceChunk = new GroundChunk(undefined, 1).fromKey(chunkKey, chunkDim)
                const cavesMask = new CavesMask(undefined, 1).fromKey(chunkKey, chunkDim)
                cavesMask.bake(worldModules)
                groundSurfaceChunk.bake(worldModules, groundLayer, cavesMask)
                // copy ground over items at last
                groundSurfaceChunk.copyContentToTarget(currentChunk)
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
                    const emptyChunk = new ChunkContainer(undefined, 1).fromKey(chunkKey, chunkDim)
                    chunks.push(emptyChunk)
                }
            }
        }

        const { processingInput, processingParams } = taskStub
        const patchKey = processingInput
        const { chunksRange, skipBlobCompression, fakeEmpty } = processingParams
        const doLower = chunksRange === ChunksProcessingRange.LowerRange || chunksRange === ChunksProcessingRange.FullRange
        const doUpper = chunksRange === ChunksProcessingRange.UpperRange || chunksRange === ChunksProcessingRange.FullRange
        const lowerChunks = doLower ? lowerChunksGen(patchKey) : []
        const upperChunks = doUpper ? upperChunksGen(patchKey, processingParams) : []

        const chunks = [...lowerChunks, ...upperChunks]
        if (fakeEmpty && chunksRange !== ChunksProcessingRange.FullRange) {
            addFakeEmptyChunks(patchKey, chunks)
        }
        return skipBlobCompression ? chunks.map(chunk => chunk.toStub()) : await chunksToCompressedBlob(chunks)
    }
    return chunksTaskHandler
}
