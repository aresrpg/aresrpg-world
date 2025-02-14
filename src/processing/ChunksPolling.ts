import { Vector2 } from 'three'
import {
    asVect3,
    genPatchMapIndex,
    getPatchMapRange,
    parsePatchKey,
} from '../utils/patch_chunk'
import { ChunkId, PatchId, PatchKey } from '../utils/common_types'

import {
    ChunksProcessing,
    ChunksProcessingTask,
    isChunksProcessingTask,
} from './ChunksProcessing'
import { worldEnv } from '../config/WorldEnv'
import { WorkerPool } from './WorkerPool'

const chunksRange = worldEnv.rawSettings.chunks.range
const { patchViewRanges } = worldEnv.rawSettings
const getTaskPatchId = (task: ChunksProcessingTask) =>
    parsePatchKey(task.processingInput.patchKey) as PatchId

export type PatchViewRanges = {
    near: number
    far: number
}

export type ViewState = {
    viewPos: Vector2
    viewRanges: PatchViewRanges
}

/**
 * OTF chunks processing depending on near/far view dist
 * with tasks priorization inside processing queue
 *
 * Chunk tasks are scheduled to follow these 2 rules:
 * - ground surface chunks always precedes underground chunks because view distance
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 *
 */

export class ChunksPolling {
    chunksWorkerPool?: WorkerPool
    // taskIndex: Record<TaskId, GenericTask> = {}
    viewState: ViewState = {
        viewPos: new Vector2(NaN, NaN),
        viewRanges: {
            near: 0,
            far: 0
        }
    }
    patchstate = {
        postponed: [],
        removed: [],
        added: []
    }

    patchIndex: Record<PatchKey, any> = {}
    // processedChunksQueue = []
    onChunkAvailable: any
    postponedTasks: ChunksProcessingTask[] = []
    skipBlobCompression = false

    get chunksProcessingTasks() {
        return this.chunksWorkerPool?.processingQueue.filter(
            isChunksProcessingTask,
        ) as ChunksProcessingTask[] || []
    }

    get visiblePatchKeys() {
        return Object.keys(this.patchIndex)
    }

    getVisibleChunkIds = () => {
        const { bottomId, topId } = chunksRange
        const chunkIds: ChunkId[] = []
        this.visiblePatchKeys.forEach(patchKey => {
            const patchId = parsePatchKey(patchKey) as PatchId
            for (let y = topId; y >= bottomId; y--) {
                const chunkId = asVect3(patchId, y)
                chunkIds.push(chunkId)
            }
        })
        return chunkIds
    }

    get nearBoundingRange() {
        const { viewPos, viewRanges } = this.viewState
        return getPatchMapRange(viewPos, viewRanges.near)
    }

    get farBoundingRange() {
        const { viewPos, viewRanges } = this.viewState
        return getPatchMapRange(viewPos, viewRanges.far)
    }

    rankTasks(tasks: ChunksProcessingTask[]) {
        const { viewPos } = this.viewState
        tasks.forEach(task => (task.rank = getTaskPatchId(task).distanceTo(viewPos)))
    }

    isBeyondNearDist = (task: ChunksProcessingTask) =>
        getTaskPatchId(task).distanceTo(this.viewState.viewPos) > this.viewState.viewRanges.near

    viewStateChanged(viewPos: Vector2, viewRange: number) {
        const { viewState } = this
        const viewChanged =
            viewState.viewPos.distanceTo(viewPos) > 0 ||
            // viewRange.near !== viewState.viewRanges.near ||
            viewState.viewRanges.far !== viewRange
        return viewChanged
    }

    scheduleTasks(patchIndex: Record<PatchKey, boolean>) {
        const { chunksWorkerPool } = this
        if (chunksWorkerPool) {
            // cancel out of range tasks in the queue
            const removedTasks = this.chunksProcessingTasks.filter(
                task => !patchIndex[task.processingInput.patchKey],
            )
            removedTasks.forEach(task => task.cancel())
            removedTasks.length &&
                console.log(`canceled ${removedTasks.length} out-of-range items from queue`,)
            const previousTasks = this.chunksProcessingTasks.filter(
                task => patchIndex[task.processingInput.patchKey],
            )
            // generate new elements skipping patch keys already found in current index
            const postponedTasks = this.postponedTasks.filter(task =>
                this.isBeyondNearDist(task),
            )
            const newTasks: ChunksProcessingTask[] = this.postponedTasks.filter(
                task => !this.isBeyondNearDist(task),
            )
            Object.keys(patchIndex)
                .filter(patchKey => !this.patchIndex[patchKey])
                .forEach(patchKey => {
                    const lowerChunksTask = ChunksProcessing.lowerChunks(patchKey)
                    lowerChunksTask.processingParams.skipBlobCompression =
                        this.skipBlobCompression
                    const upperChunksTask = ChunksProcessing.upperChunks(patchKey)
                    upperChunksTask.processingParams.skipBlobCompression =
                        this.skipBlobCompression
                    newTasks.push(upperChunksTask)
                    this.isBeyondNearDist(lowerChunksTask)
                        ? postponedTasks.push(lowerChunksTask)
                        : newTasks.push(lowerChunksTask)
                })
            // reset previous tasks state
            // previousTasks.forEach(task => task.processingState = ProcessingState.Waiting)
            // suspend lower chunks processing beyond near dist

            // update postponedTasks
            this.postponedTasks = postponedTasks
            // rank task based on distance from center
            this.rankTasks([...previousTasks, ...newTasks])
            // add new tasks to processing queue
            const pendingTasks = newTasks.map(task => task.delegate(chunksWorkerPool))
            // .then(chunks => {
            //     chunks.forEach(chunk => this.onChunkAvailable(chunk))
            // }))
            return pendingTasks
        }
        return []
    }

    /**
     * look for chunks required each time view state changes
     * and schedule related tasks
     */
    pollChunks(viewPos: Vector2, viewRange: number) {
        if (this.viewStateChanged(viewPos, viewRange)) {
            this.viewState.viewPos = viewPos
            this.viewState.viewRanges.near = Math.min(viewRange, patchViewRanges.near)
            this.viewState.viewRanges.far = viewRange

            // regen patch index from current view
            const patchIndex = genPatchMapIndex(viewPos, viewRange)
            // ret scheduled tasks
            const scheduledTasks = this.scheduleTasks(patchIndex)
            // update chunks index
            this.patchIndex = patchIndex
            return scheduledTasks
        }
        return null
    }

    // onRejectedTask(rejectedTask: ) {

    // }

    /**
     * will be called any time worker has completed task
     * to pick next element depending on current priority
     * if no task remain worker will go idle
     * - process both upper and lower chunks at near distance
     * - process only upper chunks at further distance
     */
    // override async processNextTask(onTaskCompleted: any, onBatchTerminated: any): Promise<void> {
    //     // check for items waiting processing in lower chunks queue
    //     const pendingTask = ChunksBatch.lower.processNext() || ChunksBatch.upper.processNext()
    //     if (pendingTask) {
    //         const taskRes = await pendingTask
    //         onTaskCompleted(taskRes)
    //     }
    //     // otherwise check upper chunks processing queue
    // }
}

// async function* iterPromises(remainingPromises:Promise<ChunksProcessingOutput>[]) {
//   // While there are unresolved promises
//   while (remainingPromises.length > 0) {
//     // Wait for the first promise to resolve
//     const taskRes = await Promise.race(remainingPromises);

//     // Yield the result as soon as one resolves
//     yield taskRes;

//     // Remove the resolved promise from the list of remaining promises
//     const index = remainingPromises.indexOf(taskRes.chunks.);
//     remainingPromises.splice(index, 1);
//   }
// }

// type PipelineStage<T> = {
//     in: T[],
//     out: T[]
// }
// // 2 stages pipeline: surface + caves
// const getChunksProcessingPipeline = () => {
//     const twoStagesPipeline = new LinkedList<PipelineStage<PatchKey>>({ in: [], out: [] })
//     twoStagesPipeline.next = new LinkedList<PipelineStage<PatchKey>>({ in: [], out: [] })
//     return twoStagesPipeline
// }

//     /**
//  * remove out of range element from all pipeline stages
//  */
//     purgePipeline(patchIndex: Record<PatchKey, boolean | undefined>) {
//         for (const pipelineStage of this.processingPipeline.forwardIter()) {
//             pipelineStage.data.in = pipelineStage.data.in.filter(patchKey => patchIndex[patchKey])
//             pipelineStage.data.out = pipelineStage.data.out.filter(patchKey => patchIndex[patchKey])
//         }
//     }

//     getPipelinePatchIndex() {
//         const patchIndex: Record<PatchKey, boolean | undefined> = {}
//         for (const pipelineStage of this.processingPipeline.forwardIter()) {
//             pipelineStage.data.in.forEach(patchKey => patchIndex[patchKey] = true)
//             pipelineStage.data.out.forEach(patchKey => patchIndex[patchKey] = true)
//         }
//         return patchIndex
//     }
