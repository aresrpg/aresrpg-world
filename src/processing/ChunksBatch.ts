import { Box2, Vector2 } from 'three'

import { serializePatchId } from '../utils/convert.js'
import { PatchKey } from '../utils/types.js'

import { BatchProcess } from './BatchProcessing.js'
import {
  ChunksProcessor,
  lowerChunksProcessingParams,
  upperChunksProcessingParams,
} from './ChunksProcessing.js'
import { ProcessingState } from './TaskProcessing.js'

// const { patchSize, patchDimensions } = WorldEnv.current

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

/**
 * chunks within far dist goes into surface queue first,
 * then when within near dist moves to caves queue
 * when processed is done, moves into done queue
 */
export class ViewChunksBatch extends BatchProcess<ChunksProcessor> {
  viewCenter = new Vector2(NaN, NaN)
  viewRange = 0

  constructor() {
    super([])
  }

  get queuePatchIndex() {
    const patchIndex: Record<PatchKey, boolean> = {}
    this.processingQueue.forEach(item => (patchIndex[item.patchKey] = true))
    // this.processedItems.forEach(item => patchIndex[item.patchKey] = true)
    return patchIndex
  }

  get viewPatchRange() {
    const { viewCenter, viewRange } = this
    const bmin = viewCenter.clone().subScalar(viewRange)
    const bmax = viewCenter.clone().addScalar(viewRange)
    const patchViewRange = new Box2(bmin, bmax)
    return patchViewRange
  }

  get chunkIds() {
    return this.processingQueue.map(chunkset => chunkset.chunkIds).flat()
  }

  genViewPatchIndex() {
    const patchIndex: Record<PatchKey, boolean> = {}
    // const patchIds = []
    const { min, max } = this.viewPatchRange
    for (let { y } = min; y <= max.y; y++) {
      for (let { x } = min; x <= max.x; x++) {
        const patchId = new Vector2(x, y)
        const patchKey = serializePatchId(patchId)
        patchIndex[patchKey] = true
        // patchIds.push(new Vector2(x, y))
      }
    }
    return patchIndex
  }

  reorderProcessingQueue() {
    const { viewCenter } = this
    this.processingQueue.sort(
      (e1, e2) => e1.distanceTo(viewCenter) - e2.distanceTo(viewCenter),
    )
  }

  viewChanged(viewCenter: Vector2, viewRange: number) {
    const viewChanged =
      this.viewCenter.distanceTo(viewCenter) > 0 || this.viewRange !== viewRange
    return viewChanged
  }

  computeView(viewCenter: Vector2, viewRange: number) {
    const bmin = viewCenter.clone().subScalar(viewRange)
    const bmax = viewCenter.clone().addScalar(viewRange)
    const patchViewRange = new Box2(bmin, bmax)
    const chunksKeys = []
    const { min, max } = patchViewRange
    for (let { y } = min; y <= max.y; y++) {
      for (let { x } = min; x <= max.x; x++) {
        // @ts-expect-error
        const patchKey = serializePatchId({ x, y })
        chunksKeys.push(patchKey)
      }
    }
    return chunksKeys
  }

  /**
   * called each time view center or range change to regen chunks index
   */
  async syncView(viewCenter: Vector2, viewRange: number) {
    if (this.viewChanged(viewCenter, viewRange)) {
      this.viewCenter = viewCenter
      this.viewRange = viewRange
      // regen patch index from current view
      const viewPatchIndex = this.genViewPatchIndex()
      // purge queues from out of range elements
      this.processingQueue = this.processingQueue.filter(
        item => viewPatchIndex[item.patchKey],
      )
      // this.processedItems = this.processedItems.filter(item => viewPatchIndex[item.patchKey])
      const { queuePatchIndex } = this
      // insert elements never processed before
      Object.keys(viewPatchIndex)
        .filter(patchKey => !queuePatchIndex[patchKey])
        .map(patchKey => new ChunksProcessor(patchKey))
        .forEach(chunkset => this.processingQueue.push(chunkset))
      // reorder processing queue
      this.reorderProcessingQueue()
      // this.interrupt()
      // suspend batch execution if pending
      const suspending = this.suspend() // ?.then(() => ProcessingState.Waiting)
      if (suspending) {
        await suspending
        this.printLog(`resume suspended batch`)
      }
      this.status = ProcessingState.Waiting
      BatchProcess.processNextBatch()
    }
  }

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
}

/**
 * Will process lower chunks only within near dist
 */
export class LowerChunksBatch extends ViewChunksBatch {
  override async processNextTask(onTaskCompleted: any, onBatchTerminated: any) {
    const { nextTask } = this
    if (nextTask) {
      const pendingTask = nextTask.delegate(lowerChunksProcessingParams)
      const taskRes = await pendingTask
      this.processed++
      // this.printLog(`processed task: ${nextTask.patchKey} done: ${this.processed}, pending: ${this.pendingTasks.length}, left: ${this.leftTasks.length}`)
      onTaskCompleted(taskRes)
      // this.isTerminated ? onBatchTerminated() : this.processNextTask(onTaskCompleted, onBatchTerminated)
      if (this.isTerminated) {
        this.status === ProcessingState.Suspended
          ? this.onBatchSuspended?.()
          : onBatchTerminated()
      } else if (this.status === ProcessingState.Pending)
        this.processNextTask(onTaskCompleted, onBatchTerminated)
    } else {
      // this.printLog(`[shuting down] processed: ${this.processed}, pending: ${this.pendingTasks.length}, left: ${this.leftTasks.length}`)
    }
  }
}

/**
 * Will process upper chunks at far dist
 */
export class UpperChunksBatch extends ViewChunksBatch {
  override async processNextTask(onTaskCompleted: any, onBatchTerminated: any) {
    const { nextTask } = this
    if (nextTask) {
      const pendingTask = nextTask.delegate(upperChunksProcessingParams)
      const taskRes = await pendingTask
      this.processed++
      // this.printLog(`processed: ${this.processed}, pending: ${this.pendingTasks.length}, left: ${this.leftTasks.length}`)
      onTaskCompleted(taskRes)
      if (this.isTerminated) {
        this.status === ProcessingState.Suspended
          ? this.onBatchSuspended?.()
          : onBatchTerminated()
      } else if (this.status === ProcessingState.Pending)
        this.processNextTask(onTaskCompleted, onBatchTerminated)
    } else {
      // this.printLog(`[shuting down] processed: ${this.processed}, pending: ${this.pendingTasks.length}, left: ${this.leftTasks.length}`)
    }
  }
}
