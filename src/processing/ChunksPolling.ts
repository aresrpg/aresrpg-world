import { Vector2 } from 'three'

import {
  asVect3,
  parsePatchKey,
  patchIndexFromMapRange,
  patchRangeFromMapCenterRad,
} from '../utils/patch_chunk.js'
import { ChunkId, PatchId, PatchKey } from '../utils/common_types.js'
import { worldRootEnv } from '../config/WorldEnv.js'

import {
  ChunksProcessing,
  ChunksProcessingTask,
} from './ChunksProcessing.js'
import { ProcessingState } from './TaskProcessing.js'

const chunksRange = worldRootEnv.rawSettings.chunks.range
const { patchViewRanges } = worldRootEnv.rawSettings
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
 * Chunks tasks creation, prioritization, cancellation
 *
 * Tasks are scheduled to follow these 2 rules:
 * - ground surface chunks always precedes underground chunks because view distance
 * is always greater above rather than below ground surface
 * - underground chunks always have higher priority than surface chunks because
 * near chunks needs to be displayed before far chunks and underground chunks are closer to player
 *
 */

export class ChunksPolling {
  // taskIndex: Record<TaskId, GenericTask> = {}
  viewState: ViewState = {
    viewPos: new Vector2(NaN, NaN),
    viewRanges: {
      near: 0,
      far: 0,
    },
  }

  patchstate = {
    postponed: [],
    removed: [],
    added: [],
  }

  patchIndex: Record<PatchKey, any> = {}
  // processedChunksQueue = []
  onChunkAvailable: any
  postponedTasks: ChunksProcessingTask[] = []
  pendingTasks: ChunksProcessingTask[] = []
  skipBlobCompression = false

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
    return patchRangeFromMapCenterRad(viewPos, viewRanges.near)
  }

  get farBoundingRange() {
    const { viewPos, viewRanges } = this.viewState
    return patchRangeFromMapCenterRad(viewPos, viewRanges.far)
  }

  rankTasks() {
    const { viewPos } = this.viewState
    this.pendingTasks.forEach(task =>
      task.rank = getTaskPatchId(task).distanceTo(viewPos))
  }

  isBeyondNearDist = (task: ChunksProcessingTask) =>
    getTaskPatchId(task).distanceTo(this.viewState.viewPos) >
    this.viewState.viewRanges.near

  viewStateChanged(viewPos: Vector2, viewRange: number) {
    const { viewState } = this
    const viewChanged =
      viewState.viewPos.distanceTo(viewPos) > 0 ||
      // viewRange.near !== viewState.viewRanges.near ||
      viewState.viewRanges.far !== viewRange
    return viewChanged
  }

  scheduleTasks(patchIndex: Record<PatchKey, boolean>) {
    // clear processed tasks
    this.pendingTasks = this.pendingTasks.filter(task => task.processingState !== ProcessingState.Done)
    // cancel out of range tasks in the queue
    const removedTasks = this.pendingTasks.filter(
      task => !patchIndex[task.processingInput.patchKey],
    )
    removedTasks.forEach(task => task.cancel())
    removedTasks.length &&
      console.log(
        `canceled ${removedTasks.length} out-of-range items from queue`,
      )
    this.pendingTasks.forEach(task => console.log(task.processingState))
    // clear cancelled tasks
    this.pendingTasks = this.pendingTasks.filter(task => task.processingState !== ProcessingState.Canceled)

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

    // add new tasks to pending tasks
    this.pendingTasks.push(...newTasks)
    // rank task based on distance from center
    this.rankTasks()
    // return new tasks so they can be sent to processing unit
    return newTasks
  }

  /**
   * look for chunks required each time view state changes
   * and schedule related tasks
   */
  pollChunks(patchPos: Vector2, patchViewRange: number) {
    if (this.viewStateChanged(patchPos, patchViewRange)) {
      this.viewState.viewPos = patchPos
      this.viewState.viewRanges.near = Math.min(patchViewRange, patchViewRanges.near)
      this.viewState.viewRanges.far = patchViewRange

      // regen patch index from current view
      const patchRange = patchRangeFromMapCenterRad(patchPos, patchViewRange)
      const patchIndex = patchIndexFromMapRange(patchRange)
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
