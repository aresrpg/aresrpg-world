import { Box2, Box3, Vector2, Vector3 } from 'three'

import {
  asBox2,
  asBox3,
  asVect2,
  asVect3,
  parsePatchKey,
  serializeChunkId,
} from '../utils/convert'
import {
  BlockType,
  WorldEnv,
  ChunkContainer,
  BlockMode,
  WorldComputeProxy,
  WorldUtils,
} from '../index'
import { ProcLayer } from '../procgen/ProcLayer'
import { ChunkKey, PatchKey } from '../utils/types'
import { ItemsChunkLayer } from '../misc/ItemsInventory'

import { PatchIndexer } from './ChunksIndexer'
import { DataContainer, PatchBase, PatchElement } from './PatchBase'

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
}

type ChunkIndex = Record<ChunkKey, ChunkContainer>
type BoardCacheData = {
  itemsLayer: ItemsChunkLayer
  chunkIndex: ChunkIndex
}

const getChunkYId = (y: number) =>
  Math.floor(y / WorldEnv.current.chunkDimensions.y)

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

type BoardContent = {
  chunk: ChunkContainer
  patch: BoardPatch
}

export class BoardCache extends PatchIndexer<BoardCacheData> {
  center = new Vector3()
  radius: number
  thickness: number
  constructor(radius: number, thickness: number) {
    super()
    this.radius = radius
    this.thickness = thickness
  }

  get cachedItems() {
    return Object.values(this.patchLookup)
  }

  get cachedChunks() {
    const cachedChunks: ChunkContainer[] = []
    for (const { chunkIndex } of this.indexedElements) {
      const items = Object.values(chunkIndex).filter(val => val)
      cachedChunks.push(...items)
    }
    return cachedChunks
  }

  async initCacheIndex(patchIndex: PatchKey) {
    if (!this.patchLookup[patchIndex]) {
      const itemsLayer = new ItemsChunkLayer(patchIndex)
      await itemsLayer.populate()
      // await itemsLayer.bakeAsIndividualChunks()
      const chunkIndex = {}
      const cacheData: BoardCacheData = {
        itemsLayer,
        chunkIndex,
      }
      this.patchLookup[patchIndex] = cacheData
    }
  }

  async buildCacheAroundPos(center: Vector3) {
    const { thickness, radius } = this
    const boardChunksRange = {
      bottomId: getChunkYId(center.y - thickness),
      topId: getChunkYId(center.y + thickness),
    }
    this.center = center
    const indexChanges = super.getIndexingChanges(asVect2(center), radius)
    // insert new keys in index
    await Promise.all(
      indexChanges.map(patchKey => this.initCacheIndex(patchKey)),
    )
    const indexEntries = Object.entries(this.patchLookup)
    // refresh chunks required for board construction
    for await (const [patchKey, cacheData] of indexEntries) {
      const patchId = parsePatchKey(patchKey) as Vector2
      const { chunkIndex } = cacheData
      // cache chunks only related to boards
      for (
        let yId = boardChunksRange.bottomId;
        yId <= boardChunksRange.topId;
        yId++
      ) {
        const chunkId = asVect3(patchId, yId)
        const chunkKey = serializeChunkId(chunkId)
        if (!chunkIndex[chunkKey]) {
          const chunk = await WorldComputeProxy.current.bakeUndergroundChunk(
            chunkId,
            { noEncoder: true },
          )
          chunkIndex[chunkKey] = chunk
        }
      }
    }
  }

  fillTargetChunk(boardTarget: ChunkContainer) {
    this.cachedChunks.forEach(chunk => {
      ChunkContainer.copySourceToTarget(chunk, boardTarget)
      // itemsChunks.forEach(itemSource =>
      //   ChunkContainer.copySourceToTarget(itemSource, boardTarget),
      // )
    })
  }

  querySpawnedItems(bounds: Box3) {
    const spawnedItems: ChunkContainer[] = []
    // const spawnedPlaces: Vector3[] = []
    // const individualChunks: ChunkContainer[] = []
    for (const cacheData of this.cachedItems) {
      // cacheData.itemsLayer.spawnedLocs
      //   .filter(spawnLoc => asBox2(bounds).containsPoint(asVect2(spawnLoc)))
      //   .forEach(spawnLoc => spawnedPlaces.push(spawnLoc))
      cacheData.itemsLayer.individualChunks
        .filter(itemChunk => {
          // const spawnLoc = asVect2(itemChunk.bounds.getCenter(new Vector3()))
          // return patchBounds.containsPoint(spawnLoc)
          return itemChunk.bounds.intersectsBox(bounds)
        })
        .forEach(itemChunk => spawnedItems.push(itemChunk))
    }
    // this.cachedData.forEach(({ itemsLayer }) => {
    //   const patchSpawnedItems = itemsLayer.getSpawnedItems()
    //   spawnedItems.push
    // })
    return spawnedItems
  }
}

export class BoardContainer {
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

  constructor(boardRadius?: number, boardThickness?: number) {
    const { boardSettings } = WorldEnv.current
    boardRadius = boardRadius || boardSettings.boardRadius
    boardThickness = boardThickness || boardSettings.boardThickness
    this.localCache = new BoardCache(boardRadius, boardThickness)
    this.boardParams.radius = boardRadius
    this.boardParams.thickness = boardThickness
    BoardContainer.boardHolesLayer.sampling.periodicity = 0.25
    // this.center = boardCenter
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
      const boardIter = this.boardData.iterDataQuery(bounds, true)
      return !!boardIter.next()
    }
    return false
  }

  genBoardContent(center: Vector3) {
    this.boardParams.center = center
    this.finalBounds.setFromPoints([asVect2(center)])
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
    WorldUtils.data.copySourceToTargetPatch(boardPatch, boardContent.patch)
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
      const itemOffset = this.boardElevation - itemChunk.bounds.min.y + 1
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
}
