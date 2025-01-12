import { Box2, Box3, Vector2, Vector3 } from 'three'

import {
  asBox2,
  asBox3,
  asVect2,
  asVect3,
  getPatchId,
  getUpperScalarId,
  serializePatchId,
} from '../utils/convert'
import {
  WorldEnv,
  ChunkContainer,
  BatchProcess,
  ChunksProcessor,
  BlockType,
} from '../index'
import { ProcLayer } from '../procgen/ProcLayer'
import { BlockMode, ChunkId, PatchKey } from '../utils/types'

import {
  DataContainer,
  PatchBase,
  PatchElement,
} from '../datacontainers/PatchBase'

import {
  ItemsBaker,
  ItemsProcessingParams,
  ItemsProcessingRecipes,
} from './ItemsProcessing'
import { ProcessingTask } from './TaskProcessing'
import { ChunksProcessingParams } from './ChunksProcessing'
import { copySourceToTargetPatch } from '../utils/data'
// import { UndegroundChunkset } from './ChunksProcessing'

export enum BlockCategory {
  EMPTY = 0,
  FLAT = 1,
  HOLE = 2,
  OBSTACLE = 3,
}

// export type BoardBlock = {
//   type: BlockType
//   category: BlockCategory
// }

export type BoardParams = {
  center: Vector3
  radius: number
  thickness: number
}

export type BoardStub = {
  bounds: Box2
  content: Uint8Array
  elevation?: number
}

type BoardContent = {
  chunk: ChunkContainer
  patch: BoardPatch
}

const { patchSize, patchDimensions } = WorldEnv.current

class BoardPatch extends PatchBase<number> implements DataContainer {
  rawData: Uint8Array

  constructor(bounds: Box2, margin = 0) {
    super(bounds, margin)
    this.rawData = new Uint8Array(this.extendedDims.x * this.extendedDims.y)
  }

  override toStub(): BoardStub {
    const { rawData, bounds } = this
    return {
      bounds,
      // elevation: 0,
      content: rawData,
    }
  }

  override *iterDataQuery(
    iterBounds?: Box2 | Vector2 | undefined,
    skipMargin?: boolean,
    skipEmpty = true,
  ) {
    const elements = super.iterDataQuery(iterBounds, skipMargin)
    for (const element of elements) {
      const { index } = element
      const data = this.rawData[index] || BlockCategory.EMPTY
      if (data || !skipEmpty) {
        const boardElement: PatchElement<number> = {
          ...element,
          data,
        }
        yield boardElement
      }
    }
  }

  override containsPoint(pos: Vector2) {
    const localPos = this.toLocalPos(pos)
    const index = this.getIndex(localPos)
    const val = this.rawData[index]
    return !!val
  }
}

/**
 * Will handle chunks processing and storing used to build board
 */
export class BoardCache extends BatchProcess<ProcessingTask> {
  centerPatchId = new Vector2(NaN, NaN)
  patchRange = 0

  constructor(centerPatchId: Vector2, patchRange: number) {
    super([])
    this.centerPatchId = centerPatchId
    this.patchRange = patchRange
  }

  // override onTaskCompleted(task: ProcessingTask) {
  //   console.log(task)
  // }

  override onBatchCompleted(): void {
    console.log(`BoardCache: ready!`)
  }

  get itemsProcessors() {
    return this.finishedTask
      .filter(task => task instanceof ItemsBaker) as ItemsBaker[];
  }

  get chunksProcessors() {
    return this.finishedTask
      .filter(task => task instanceof ChunksProcessor) as ChunksProcessor[];
  }

  get processedChunks() {
    const allProcessedChunks = []
    // iter board indexed chunks
    for (const chunkProcessor of this.chunksProcessors) {
      const processedChunks = chunkProcessor.result as ChunkContainer[]
      allProcessedChunks.push(...processedChunks)
    }
    return allProcessedChunks
  }

  get processedItemsChunks() {
    const processedItemsChunks = []
    // iter board indexed chunks
    for (const itemProcessor of this.itemsProcessors) {
      const itemsChunks = itemProcessor.result as ChunkContainer[]
      processedItemsChunks.push(...itemsChunks)
    }
    return processedItemsChunks
  }

  get boundingPatchIds() {
    const { centerPatchId, patchRange } = this
    const bmin = centerPatchId.clone().subScalar(patchRange)
    const bmax = centerPatchId.clone().addScalar(patchRange)
    const mapRange = new Box2(bmin, bmax)
    return mapRange
  }

  buildPatchIndex() {
    const patchIndex: Record<PatchKey, boolean> = {}
    // const patchIds = []
    const { min, max } = this.boundingPatchIds
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

  /**
   * call each time view settings changes to regen batch
   */
  build() {
    // regen patch index from current view settings
    const patchIndex = this.buildPatchIndex()
    const chunksProcessingParams: ChunksProcessingParams = {
      skipEntities: true,
      noDataEncoding: true
    }
    // insert chunks gen tasks in processing queue
    Object.keys(patchIndex)
      .map(patchKey => new ChunksProcessor(patchKey))
      .forEach(task => {
        task.processingParams = chunksProcessingParams
        this.processingQueue.push(task)
      })

    const itemsProcessingParams: ItemsProcessingParams = {
      recipe: ItemsProcessingRecipes.IndividualChunks,
    }

    // insert items gen tasks in processing queue
    Object.keys(patchIndex)
      .map(patchKey => new ItemsBaker(patchKey))
      .forEach(task => {
        task.processingParams = itemsProcessingParams
        this.processingQueue.push(task)
      })
  }

  /**
   * fills target chunk from cache
   */
  fillTargetChunk(boardTarget: ChunkContainer) {
    this.processedChunks.forEach(chunk => {
      ChunkContainer.copySourceToTarget(chunk, boardTarget)
      // itemsChunks.forEach(itemSource =>
      //   ChunkContainer.copySourceToTarget(itemSource, boardTarget),
      // )
    })
  }

  querySpawnedItems(bounds: Box3) {
    const { itemsProcessors } = this
    const spawnedItems: ChunkContainer[] = []
    itemsProcessors.forEach(itemProcessor => {
      const itemsChunks = itemProcessor.result as ChunkContainer[]
      itemsChunks.filter(itemChunk => {
        // const spawnLoc = asVect2(itemChunk.bounds.getCenter(new Vector3()))
        // return patchBounds.containsPoint(spawnLoc)
        return itemChunk.bounds.intersectsBox(bounds)
      }).forEach(itemChunk => spawnedItems.push(itemChunk))
    })
    return spawnedItems
  }
}

/**
 * Call:
 * - `start` to create unique board instance at specific location
 * - `terminate` to remove board instance
 */
export class BoardContainer {
  static singleton: BoardContainer | null
  localCache: BoardCache
  // dedicatedWorker:
  // board input
  boardParams: BoardParams = {
    center: new Vector3(),
    radius: 0,
    thickness: 0,
  }

  finalBounds = new Box2()

  boardData!: BoardPatch
  static boardHolesLayer = new ProcLayer('holesMap')

  /**
   * access unique board instance from anywhere
   */
  static get instance() {
    return this.singleton
  }

  /**
   * create board instance running in background
   */
  static createInstance(boardPosition: Vector3) {
    this.singleton = this.singleton || new BoardContainer(boardPosition)
    return this.singleton
  }

  /**
   * 
   */
  static deleteInstance() {
    this.singleton = null
  }

  constructor(boardCenter: Vector3, boardRadius?: number, boardThickness?: number) {
    const { boardSettings } = WorldEnv.current
    boardRadius = boardRadius || boardSettings.boardRadius
    boardThickness = boardThickness || boardSettings.boardThickness
    this.boardParams.center = boardCenter.clone().floor()
    this.boardParams.radius = boardRadius
    this.boardParams.thickness = boardThickness
    BoardContainer.boardHolesLayer.sampling.periodicity = 0.25
    this.localCache = new BoardCache(this.centerPatchId, this.patchRange)
    this.localCache.build()
    // this.center = boardCenter
    console.log(`instantiate board at ${serializePatchId(this.centerPatchId)} (radius: ${boardRadius}, thickness: ${boardThickness})`)
  }

  get centerPatchId() {
    return getPatchId(asVect2(this.boardParams.center), patchDimensions)
  }

  get patchRange() {
    return getUpperScalarId(this.boardParams.radius, patchSize)
  }

  get initialDims() {
    const { radius, thickness } = this.boardParams
    const boardDims = new Vector3(radius, thickness, radius).multiplyScalar(2)
    return boardDims
  }

  get initialBounds() {
    const { center } = this.boardParams
    const initialBounds = new Box3().setFromCenterAndSize(
      center,
      this.initialDims,
    )
    return initialBounds
  }

  get boardElevation() {
    return this.boardParams.center.y
  }

  get boardCenter() {
    return asVect2(this.boardParams.center)
  }

  isWithinBoard(buffPos: Vector2, buffer: Uint16Array) {
    const { radius, center } = this.boardParams
    if (buffPos) {
      const lastBlock = buffer[buffer.length - 2]
      const isEmpty =
        buffer.slice(1, -1).reduce((sum, val) => sum + val, 0) === 0
      // const isFull = buffer.slice(1, -1).find(val => val === 0) === undefined
      const centerDist = buffPos.distanceTo(asVect2(center))
      const isInside = centerDist <= radius && !isEmpty && lastBlock === 0
      return isInside
    }
    // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
    return false
  }

  overlapsBoard(bounds: Box2) {
    if (this.boardData) {
      // const boardIter = this.boardData.iterDataQuery(bounds, true)
      // return !!boardIter.next()
      return this.boardData.bounds.intersectsBox(bounds)
    }
    return false
  }

  get nonOverlappingItemsChunks() {
    const matching = this.localCache.processedItemsChunks
      .filter(itemChunk => !this.overlapsBoard(asBox2(itemChunk.bounds)))
    return matching
  }

  async genBoardContent() {
    const onCacheReady = new Promise(resolve => {
      this.localCache.enqueue(undefined, resolve)
    }).then(() => console.log(`Board cache is ready!`))
    await onCacheReady
    console.log(`gen board content`)
    // this.boardParams.center = center
    this.finalBounds.setFromPoints([this.boardCenter])
    const emptyBlock = ChunkContainer.dataEncoder(BlockType.NONE)
    const initialPatchBounds = asBox2(this.initialBounds)
    const boardPatch = new BoardPatch(initialPatchBounds)
    const boardChunk = new ChunkContainer(this.initialBounds, 1)
    // fill chunk from cache
    this.localCache.fillTargetChunk(boardChunk)
    // const chunkHeightBuffers = boardChunk.iterChunkBuffers()
    // for (const heightBuff of chunkHeightBuffers) {
    for (const patchIter of boardPatch.iterDataQuery(undefined, false, false)) {
      const heightBuff = boardChunk.readBuffer(patchIter.localPos)
      // const empty = chunkBuff.data.reduce((sum, val) => sum + val, 0) === 0
      // const full = chunkBuff.data.find(val => val === 0) === undefined
      if (this.isWithinBoard(patchIter.pos, heightBuff)) {
        this.finalBounds.expandByPoint(patchIter.pos)
        const marginBlock = ChunkContainer.dataEncoder(
          heightBuff[0] || BlockType.NONE,
        )
        heightBuff[0] = marginBlock
        // chunkBuff.data.fill(33,0,2)
        // find last empty block
        const surfaceIndex = Math.max(heightBuff.findIndex(val => !val) - 1, 0)
        const surfaceBlock = ChunkContainer.dataEncoder(
          heightBuff[surfaceIndex] || BlockType.NONE,
          BlockMode.CHECKERBOARD,
        )
        const undergroundBlock = ChunkContainer.dataEncoder(
          heightBuff[surfaceIndex] || BlockType.NONE,
        )
        // const groundBlock = ChunkContainer.dataEncoder(heightBuff[1] || BlockType.NONE, BlockMode.CHECKERBOARD)
        const { thickness: boardThickness } = this.boardParams
        for (let i = 0; i < boardThickness; i++) {
          heightBuff[i] = undergroundBlock
        }
        heightBuff[boardThickness] = surfaceBlock
        heightBuff.fill(emptyBlock, boardThickness + 1)
        boardPatch.rawData[patchIter.index] = BlockCategory.FLAT
      } else {
        heightBuff.forEach((val, i) => {
          heightBuff[i] = ChunkContainer.dataEncoder(val)
        })
        boardPatch.rawData[patchIter.index] = BlockCategory.EMPTY
      }
      boardChunk.writeBuffer(patchIter.localPos, heightBuff)
      // boardPatch.
    }
    // compute final bounds & version of patch and chunk
    const finalChunkBounds = asBox3(this.finalBounds)
    finalChunkBounds.min.y = boardChunk.bounds.min.y
    finalChunkBounds.max.y = boardChunk.bounds.max.y
    const boardContent: BoardContent = {
      patch: new BoardPatch(this.finalBounds),
      chunk: new ChunkContainer(finalChunkBounds, 1),
    }
    copySourceToTargetPatch(boardPatch, boardContent.patch)
    ChunkContainer.copySourceToTarget(boardChunk, boardContent.chunk)
    this.addTrimmedItems(boardContent.patch, boardContent.chunk)
    this.boardData = boardContent.patch
    return boardContent
  }

  // trim items spawning inside board
  addTrimmedItems(boardPatch: BoardPatch, boardChunk: ChunkContainer) {
    const boardSpawnedItems = this.localCache.querySpawnedItems(
      boardChunk.bounds,
    )
    for (const itemChunk of boardSpawnedItems) {
      const itemOffset = this.boardElevation - itemChunk.bounds.min.y
      // iter slice from item which is at same level as the board
      if (itemOffset >= 0) {
        for (const heightBuff of itemChunk.iterChunkSlice()) {
          const itemBlockData = heightBuff.data[itemOffset]
          // if blocks belongs to board
          if (itemBlockData && boardPatch.containsPoint(heightBuff.pos)) {
            const itemBlockPos = asVect3(heightBuff.pos, this.boardElevation)
            const chunkLocalPos = boardChunk.toLocalPos(itemBlockPos)
            const chunkIndex = boardChunk.getIndex(chunkLocalPos)
            // copy block to board chunk
            console.log(`writing item block to board`)
            boardChunk.rawData[chunkIndex] = itemBlockData
            // and mark block as obstacle in board patch
            const patchLocalPos = boardPatch.toLocalPos(heightBuff.pos)
            const patchIndex = boardPatch.getIndex(patchLocalPos)
            boardPatch.rawData[patchIndex] = BlockCategory.OBSTACLE
          }
        }
      }

      // const spawnPos = itemChunk.bounds.getCenter(new Vector3())
      // const spawnLocalPos = asVect2(boardBuffer.toLocalPos(spawnPos))
      // const treeBuff = []
      // boardBuffer.writeBuffer(spawnLocalPos, treeBuff);
      // TODO: compute item's footprint on board's ground to mark block as obstacles
      // slice chunk at one block above the board
      // const itemSlice = itemChunk.slice(this.boardElevation, this.boardElevation + 1)
      // ChunkContainer.copySourceToTarget(itemSlice, boardContent.chunk)
      // const itemElements = itemChunk.iterChunkBuffers(boardContent.chunk.bounds)
      // for (const itemElem of itemElements) {
      //   itemElem.pos
      //   itemElem.data
      // }
    }
  }

  *overrideOriginalChunksContent(boardChunk: ChunkContainer, targetChunkId?: ChunkId) {
    const { nonOverlappingItemsChunks } = this
    // iter processed original chunks
    for (const originalChunk of this.localCache.processedChunks) {
      // board_chunk.rawData.fill(113)
      const targetChunk = new ChunkContainer(
        originalChunk.chunkKey,
        originalChunk.margin,
      )
      originalChunk.rawData.forEach((val, i) => targetChunk.rawData[i] = ChunkContainer.dataEncoder(val))
      // copy items individually
      nonOverlappingItemsChunks.forEach(itemChunk => ChunkContainer.copySourceToTarget(itemChunk, targetChunk))
      // override with board_buffer
      ChunkContainer.copySourceToTarget(boardChunk, targetChunk, false)
      yield targetChunk
    }
  }

  *restoreOriginalChunksContent() {
    const { processedItemsChunks } = this.localCache
    // iter processed original chunks
    for (const originalChunk of this.localCache.processedChunks) {
      // board_chunk.rawData.fill(113)
      const targetChunk = new ChunkContainer(
        originalChunk.chunkKey,
        originalChunk.margin,
      )
      originalChunk.rawData.forEach((val, i) => targetChunk.rawData[i] = ChunkContainer.dataEncoder(val))
      // copy items individually
      processedItemsChunks.forEach(itemChunk => ChunkContainer.copySourceToTarget(itemChunk, targetChunk))
      yield targetChunk
    }
  }
}
