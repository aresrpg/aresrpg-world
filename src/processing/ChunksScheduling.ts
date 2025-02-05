import { Vector2 } from 'three'

import { WorkerPool, WorldEnv } from '../index'
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

const chunksRange = WorldEnv.current.chunks.range
const getTaskPatchId = (task: ChunksProcessingTask) =>
  parsePatchKey(task.processingInput.patchKey) as PatchId

export type PatchViewRange = {
  near: number
  far: number
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

export class ChunksScheduler {
  workerPool: WorkerPool
  // taskIndex: Record<TaskId, GenericTask> = {}
  centerPatch = new Vector2(NaN, NaN)
  patchViewRange: PatchViewRange = {
    near: 0,
    far: 0,
  }

  patchIndex: Record<PatchKey, any> = {}
  // processedChunksQueue = []
  onChunkAvailable: any
  postponedTasks: ChunksProcessingTask[] = []
  skipBlobCompression = false

  constructor(workerPool: WorkerPool) {
    this.workerPool = workerPool
  }

  get chunksProcessingTasks() {
    return this.workerPool.processingQueue.filter(
      isChunksProcessingTask,
    ) as ChunksProcessingTask[]
  }

  get patchKeys() {
    return Object.keys(this.patchIndex)
  }

  get chunkIds() {
    const { bottomId, topId } = chunksRange
    const chunkIds: ChunkId[] = []
    this.patchKeys.forEach(patchKey => {
      const patchId = parsePatchKey(patchKey) as PatchId
      for (let y = topId; y >= bottomId; y--) {
        const chunkId = asVect3(patchId, y)
        chunkIds.push(chunkId)
      }
    })
    return chunkIds
  }

  get nearBoundingRange() {
    return getPatchMapRange(this.centerPatch, this.patchViewRange.near)
  }

  get farBoundingRange() {
    return getPatchMapRange(this.centerPatch, this.patchViewRange.far)
  }

  reorderTasks(tasks: ChunksProcessingTask[]) {
    const { centerPatch } = this
    tasks
      .sort((task1, task2) => {
        const dist1 = getTaskPatchId(task1).distanceTo(centerPatch)
        const dist2 = getTaskPatchId(task2).distanceTo(centerPatch)
        return dist1 - dist2
      })
      .forEach((task, index) => (task.order = index))
  }

  isBeyondNearDist = (task: ChunksProcessingTask) =>
    getTaskPatchId(task).distanceTo(this.centerPatch) > this.patchViewRange.near

  viewChanged(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
    const viewChanged =
      this.centerPatch.distanceTo(centerPatch) > 0 ||
      this.patchViewRange.near !== rangeNear ||
      this.patchViewRange.far !== rangeFar
    return viewChanged
  }

  /**
   * called each time view center or range change to regen chunks index
   */
  requestChunks(centerPatch: Vector2, rangeNear: number, rangeFar: number) {
    if (this.viewChanged(centerPatch, rangeNear, rangeFar)) {
      this.centerPatch = centerPatch
      this.patchViewRange.near = rangeNear
      this.patchViewRange.far = rangeFar
      // regen patch index from current view
      const patchIndex = genPatchMapIndex(centerPatch, rangeFar)
      // cancel out of range task in the queue
      const removedTasks = this.chunksProcessingTasks.filter(
        task => !patchIndex[task.processingInput.patchKey],
      )
      removedTasks.forEach(task => task.cancel())
      removedTasks.length &&
        console.log(
          `canceled ${removedTasks.length} out-of-range items from queue`,
        )
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
      // reprioritize items
      this.reorderTasks([...previousTasks, ...newTasks])
      // add new tasks to processing queue
      newTasks.map(task =>
        task
          .delegate(this.workerPool)
          .then(chunks =>
            chunks.forEach(chunk => this.onChunkAvailable(chunk)),
          ),
      )
      // update chunks index
      this.patchIndex = patchIndex
    }
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
