import { Box2, Box3, Vector2, Vector3 } from 'three'

import {
  asBox2,
  asBox3,
  asVect2,
  asVect3,
  genChunkIds,
  genPatchMapIndex,
  getPatchId,
  getUpperScalarId,
  parsePatchKey,
  serializePatchId,
} from '../utils/patch_chunk'
import { ChunkContainer, BlockType, WorkerPool } from '../index'
import { ChunkId, PatchId, PatchKey } from '../utils/common_types'
import {
  DataContainer,
  PatchBase,
  PatchElement,
} from '../datacontainers/PatchBase'
import { copySourceToTargetPatch } from '../utils/data_operations'
import { ChunkStub } from '../datacontainers/ChunkContainer'
import { worldEnv } from '../config/WorldEnv'

import { ChunksProcessing } from './ChunksProcessing'
import { ItemsProcessing } from './ItemsProcessing'

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
    globalBounds?: Box2 | undefined,
    includeMargins?: boolean,
    skipEmpty = true,
  ) {
    const elements = super.iterDataQuery(globalBounds, includeMargins)
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

const chunksRange = worldEnv.rawSettings.chunks.range

/**
 * Handle chunks and items tasks and provide data required to build board content:
 */
export class BoardCacheProvider {
  // eslint-disable-next-line no-undef
  workerPool: WorkerPool
  localCache: {
    chunks: ChunkContainer[]
    items: ChunkContainer[]
  } = {
    chunks: [],
    items: [],
  }

  // taskIndex: Record<TaskId, GenericTask> = {}
  centerPatch = new Vector2(NaN, NaN)
  patchRange = 0
  patchIndex: Record<PatchKey, any> = {}
  pendingBoardGen = false

  // eslint-disable-next-line no-undef
  constructor(workerPool: WorkerPool) {
    this.workerPool = workerPool
  }

  boardChanged = (centerPatch: Vector2, patchRange: number) =>
    this.centerPatch.distanceTo(centerPatch) > 0 ||
    this.patchRange !== patchRange

  // constructor(centerPatchId: Vector2, patchRange: number) {
  //   this.centerPatchId = centerPatchId
  //   this.patchRange = patchRange
  // }

  get patchKeys() {
    return Object.keys(this.patchIndex)
  }

  get chunkIds() {
    const { bottomId, topId } = chunksRange
    const chunkIds: ChunkId[] = []
    this.patchKeys.forEach(patchKey => {
      const patchId = parsePatchKey(patchKey) as PatchId
      chunkIds.push(...genChunkIds(patchId, bottomId, topId))
    })
    return chunkIds
  }

  get chunks() {
    return this.localCache.chunks
  }

  get items() {
    return this.localCache.items
  }

  /**
   * called each time cache needs to be rebuilt
   */
  loadData = async (centerPatch: Vector2, patchRange: number) => {
    if (this.boardChanged(centerPatch, patchRange)) {
      this.pendingBoardGen = true
      this.centerPatch = centerPatch
      this.patchRange = patchRange
      // regen patch index from current board position
      const patchIndex = genPatchMapIndex(this.centerPatch, this.patchRange)
      // enqueue chunks processing tasks
      const chunksPendingTasks = Object.keys(patchIndex)
        .filter(patchKey => !this.patchIndex[patchKey])
        .map(patchKey => ChunksProcessing.fullChunks(patchKey))
        .map(chunkTask => {
          chunkTask.processingParams.noDataEncoding = true
          chunkTask.processingParams.skipEntities = true
          chunkTask.processingParams.skipBlobCompression = true
          const pendingChunkTask = chunkTask.delegate(this.workerPool)
          // once done put result in cache
          pendingChunkTask.then(taskRes => {
            // reconstruct objects from stubs
            const chunks = taskRes.map((chunkStub: ChunkStub) =>
              ChunkContainer.fromStub(chunkStub),
            )
            this.localCache.chunks.push(...chunks)
          })
          return pendingChunkTask
        })
      // enqueue items processing tasks
      const itemsPendingTasks = Object.keys(patchIndex)
        .filter(patchKey => !this.patchIndex[patchKey])
        .map(patchKey => ItemsProcessing.bakeIndividualChunks(patchKey))
        .map(itemTask => {
          const pendingItemTask = itemTask.delegate(this.workerPool)
          // once done put result in cache
          pendingItemTask.then(taskRes => {
            this.localCache.items.push(...(taskRes as ChunkContainer[]))
          })
          return pendingItemTask
        })
      // update index
      this.patchIndex = patchIndex
      await Promise.all([...chunksPendingTasks, ...itemsPendingTasks])
      console.log(`BoardCache: ready!`)
    }
  }

  /**
   * fills target chunk from cache
   */
  fillTargetChunk(targetChunk: ChunkContainer) {
    this.localCache.chunks.forEach(sourceChunk => {
      ChunkContainer.copySourceToTarget(sourceChunk, targetChunk)
    })
    // itemsChunks.forEach(itemSource =>
    //   ChunkContainer.copySourceToTarget(itemSource, boardTarget),
    // )
  }

  getSpawnedItems(bounds: Box3) {
    const spawnedItems = this.localCache.items.filter(chunk =>
      chunk.bounds.intersectsBox(bounds),
    )
    return spawnedItems
  }
}

type BoardContent = {
  chunk: ChunkContainer
  patch: BoardPatch
}

/**
 * Call:
 * - `start` to create unique board instance at specific location
 * - `terminate` to remove board instance
 */
export class BoardProvider {
  // eslint-disable-next-line no-use-before-define
  static singleton: BoardProvider | null
  cacheProvider: BoardCacheProvider
  // dedicatedWorker:
  // board input
  boardParams: BoardParams = {
    center: new Vector3(),
    radius: 0,
    thickness: 0,
  }

  finalBounds = new Box2()

  boardData!: BoardPatch

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
    this.singleton = this.singleton || new BoardProvider(boardPosition)
    return this.singleton
  }

  /**
   *
   */
  static deleteInstance() {
    this.singleton = null
  }

  constructor(
    boardCenter: Vector3,
    dedicatedWorkerPool = WorkerPool.default,
    boardRadius?: number,
    boardThickness?: number,
  ) {
    boardRadius = boardRadius || worldEnv.rawSettings.boards.boardRadius
    boardThickness =
      boardThickness || worldEnv.rawSettings.boards.boardThickness
    this.boardParams.center = boardCenter.clone().floor()
    this.boardParams.radius = boardRadius
    this.boardParams.thickness = boardThickness
    // const holesLayer = new ProcLayer('holesMap')
    // holesLayer.sampling.periodicity = 0.25
    // @ts-ignore
    this.cacheProvider = new BoardCacheProvider(dedicatedWorkerPool)
    // this.center = boardCenter
    console.log(
      `create board at ${serializePatchId(this.centerPatchId)} (radius: ${boardRadius}, thickness: ${boardThickness})`,
    )
  }

  get centerPatchId() {
    return getPatchId(
      asVect2(this.boardParams.center),
      worldEnv.getPatchDimensions(),
    )
  }

  get patchRange() {
    return getUpperScalarId(this.boardParams.radius, worldEnv.getPatchSize())
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
      // const isFull = buffer.slice(1, -1).find(val => val === 0) === undefined
      const centerDist = buffPos.distanceTo(asVect2(center))
      const isInside = centerDist <= radius && lastBlock === 0
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
    const matching = this.cacheProvider.items.filter(
      itemChunk => !this.overlapsBoard(asBox2(itemChunk.bounds)),
    )
    return matching
  }

  overrideHeightBuffer = (heightBuff: Uint16Array, isHoleBlock: boolean) => {
    const { thickness: boardThickness } = this.boardParams
    // const marginBlockType = isHoleBlock ? BlockType.HOLE : heightBuff[0]
    const surfaceType = heightBuff
      .slice(1, boardThickness + 1)
      .reverse()
      .find(val => !!val)
    const boardHeightBuffer = heightBuff.map((val, i) => {
      // return i <= boardThickness ? val : BlockType.NONE
      if (i > boardThickness) {
        return BlockType.NONE
      } else {
        let blockType = val
        if (isHoleBlock) {
          blockType = i < boardThickness ? BlockType.HOLE : blockType
        } else {
          blockType = !val ? surfaceType || BlockType.NONE : blockType
        }
        // const blockMode =
        //   i === boardThickness ? BlockMode.CHECKERBOARD : BlockMode.REGULAR
        return blockType // ChunkContainer.dataEncoder(blockType, blockMode)
      }
    })

    return boardHeightBuffer
  }

  async genBoardContent(skipHoleBlocks = true) {
    const { thickness: boardThickness } = this.boardParams
    // wait for cache to be filled
    await this.cacheProvider.loadData(this.centerPatchId, this.patchRange)
    // this.boardParams.center = center
    this.finalBounds.setFromPoints([this.boardCenter])
    const initialPatchBounds = asBox2(this.initialBounds)
    const boardPatch = new BoardPatch(initialPatchBounds)
    const boardChunk = new ChunkContainer(this.initialBounds, 1)
    // fill chunk from cache
    this.cacheProvider.fillTargetChunk(boardChunk)
    // const chunkHeightBuffers = boardChunk.iterChunkBuffers()
    // for (const heightBuff of chunkHeightBuffers) {
    for (const patchIter of boardPatch.iterDataQuery(undefined, true, false)) {
      const heightBuff = boardChunk.readBuffer(patchIter.localPos)
      const isWithinBoard = this.isWithinBoard(patchIter.pos, heightBuff)
      const isHoleBlock =
        isWithinBoard &&
        heightBuff
          .slice(1, boardThickness + 1)
          .reduce((sum, val) => sum + val, 0) === 0
      // const empty = chunkBuff.data.reduce((sum, val) => sum + val, 0) === 0
      // const full = chunkBuff.data.find(val => val === 0) === undefined
      isWithinBoard && this.finalBounds.expandByPoint(patchIter.pos)
      // update board patch bounds and data
      boardPatch.rawData[patchIter.index] =
        isWithinBoard && (!isHoleBlock || !skipHoleBlocks)
          ? isHoleBlock
            ? BlockCategory.HOLE
            : BlockCategory.FLAT
          : BlockCategory.EMPTY
      // override height buffer with board version if within board
      const finalHeightBuffer =
        isWithinBoard && (!isHoleBlock || !skipHoleBlocks)
          ? this.overrideHeightBuffer(heightBuff, isHoleBlock)
          : heightBuff
      boardChunk.writeBuffer(patchIter.localPos, finalHeightBuffer)
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

    const boardSpawnedItems = this.cacheProvider.getSpawnedItems(
      boardChunk.bounds,
    )
    this.addTrimmedItems(
      boardContent.patch,
      boardContent.chunk,
      boardSpawnedItems,
    )
    this.boardData = boardContent.patch
    return boardContent
  }

  // trim items spawning inside board
  addTrimmedItems(
    boardPatch: BoardPatch,
    boardChunk: ChunkContainer,
    boardSpawnedItems: ChunkContainer[],
  ) {
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

  *overrideOriginalChunksContent(
    boardChunk: ChunkContainer,
    targetChunkId?: ChunkId,
  ) {
    const { nonOverlappingItemsChunks } = this
    if (targetChunkId) {
      // TODO
    }
    // iter processed original chunks
    for (const originalChunk of this.cacheProvider.chunks) {
      // board_chunk.rawData.fill(113)
      const targetChunk = new ChunkContainer(
        originalChunk.chunkKey,
        originalChunk.margin,
      )
      // originalChunk.rawData.forEach(
      //   (val, i) => (targetChunk.rawData[i] = ChunkContainer.dataEncoder(val)),
      // )
      // copy items individually
      nonOverlappingItemsChunks.forEach(itemChunk =>
        ChunkContainer.copySourceToTarget(itemChunk, targetChunk),
      )
      // override with board_buffer
      ChunkContainer.copySourceToTarget(boardChunk, targetChunk, false)
      yield targetChunk
    }
  }

  *restoreOriginalChunksContent() {
    // iter processed original chunks
    for (const originalChunk of this.cacheProvider.chunks) {
      // board_chunk.rawData.fill(113)
      const targetChunk = new ChunkContainer(
        originalChunk.chunkKey,
        originalChunk.margin,
      )
      // originalChunk.rawData.forEach(
      //   (val, i) => (targetChunk.rawData[i] = ChunkContainer.dataEncoder(val)),
      // )
      // copy items individually
      this.cacheProvider.items.forEach(itemChunk =>
        ChunkContainer.copySourceToTarget(itemChunk, targetChunk),
      )
      yield targetChunk
    }
  }
}
