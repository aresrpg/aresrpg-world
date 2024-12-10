import { Box2, Box3, Vector2, Vector3 } from 'three'

import { asBox2, asBox3, asVect2, asVect3, parsePatchKey, serializeChunkId } from '../utils/common'
import {
  BlockType,
  WorldEnv,
  ChunkContainer,
  BlockMode,
  WorldComputeProxy,
} from '../index'
import { GroundPatch } from './GroundPatch'
import { ProcLayer } from '../procgen/ProcLayer'
import { PatchIndexer } from './ChunksIndexer'
import { ChunkKey, PatchKey } from '../utils/types'
import { ItemsChunkLayer } from '../misc/ItemsInventory'

export enum BlockCategory {
  EMPTY = 0,
  FLAT = 1,
  HOLE = 2,
  OBSTACLE = 3,
}

export type BoardBlock = {
  type: BlockType
  category: BlockCategory
}

export type BoardParams = {
  center: Vector3
  radius: number
  thickness: number
}

export type BoardContent = {
  bounds: Box2
  elevation: number
  data: BoardBlock[]
}

type ChunkIndex = Record<ChunkKey, ChunkContainer>
type BoardCacheData = {
  itemsLayer: ItemsChunkLayer,
  chunkIndex: ChunkIndex
}

// export type BoardParams = BoardInputParams & { center: Vector3 }

// map block type to board block type
const blockTypeCategoryMapper = (blockType: BlockType) => {
  switch (blockType) {
    case BlockType.TRUNK:
      return BlockCategory.OBSTACLE
    case BlockType.HOLE:
      return BlockCategory.HOLE
    default:
      return BlockCategory.FLAT
  }
}

const getChunkYId = (y: number) => Math.floor(y / WorldEnv.current.chunkDimensions.y)




export class BoardCache extends PatchIndexer<BoardCacheData> {
  center = new Vector3
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
        chunkIndex
      }
      this.patchLookup[patchIndex] = cacheData
    }
  }

  async buildCacheAroundPos(center: Vector3) {
    const { thickness, radius } = this
    const boardChunksRange = {
      bottomId: getChunkYId(center.y - thickness),
      topId: getChunkYId(center.y + thickness)
    }
    this.center = center
    const indexChanges = super.getIndexingChanges(asVect2(center), radius)
    // insert new keys in index
    Promise.all(indexChanges.map(patchKey => this.initCacheIndex(patchKey)))
    const indexEntries = Object.entries(this.patchLookup)
    // refresh chunks required for board construction
    for await (const [patchKey, cacheData] of indexEntries) {
      const patchId = parsePatchKey(patchKey) as Vector2
      const { chunkIndex } = cacheData

      // cache chunks only related to boards
      for (let yId = boardChunksRange.bottomId; yId <= boardChunksRange.topId; yId++) {
        const chunkId = asVect3(patchId, yId)
        const chunkKey = serializeChunkId(chunkId)
        if (!chunkIndex[chunkKey]) {
          const chunk = await WorldComputeProxy.current.bakeUndergroundChunk(chunkId, { noEncoder: true })
          chunkIndex[chunkKey] = chunk
        }
      }
      // const boardChunksGenerator = new ChunksOTFGenerator(patchKey)
      // await boardChunksGenerator.init()
      // const boardChunkIds = Object.keys(this.indexed[patchKey])
      // const chunksOtfGen = boardChunksGenerator.otfChunkGen(boardChunkIds)
      // for await (const chunk of chunksOtfGen) {
      //   const { chunkKey } = chunk
      //   this.indexed[patchKey][chunkKey] = chunk
      // }
    }
  }

  fillTargetChunk(boardTarget: ChunkContainer) {
    this.cachedChunks.forEach((chunk) => {
      ChunkContainer.copySourceToTarget(chunk, boardTarget)
      // itemsChunks.forEach(itemSource =>
      //   ChunkContainer.copySourceToTarget(itemSource, boardTarget),
      // )
    })
  }

  querySpawnedItems(bounds: Box3) {
    const patchBounds = asBox2(bounds)
    const spawnedItems: ChunkContainer[] = []
    // const spawnedPlaces: Vector3[] = []
    // const individualChunks: ChunkContainer[] = []
    for (const cacheData of this.cachedItems) {
      // cacheData.itemsLayer.spawnedLocs
      //   .filter(spawnLoc => asBox2(bounds).containsPoint(asVect2(spawnLoc)))
      //   .forEach(spawnLoc => spawnedPlaces.push(spawnLoc))
      cacheData.itemsLayer.individualChunks
        .filter(itemChunk => {
          const spawnLoc = asVect2(itemChunk.bounds.getCenter(new Vector3))
          return patchBounds.containsPoint(spawnLoc)
          // return itemChunk.bounds.intersectsBox(bounds)
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
    center: new Vector3,
    radius: 0,
    thickness: 0
  }
  // board output
  boardData: BoardContent = {
    bounds: new Box2,
    elevation: 0,
    data: []
  }
  // board content
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

  get boardInitialDims() {
    const { radius, thickness } = this.boardParams
    const boardDims = new Vector3(radius, thickness, radius).multiplyScalar(2)
    return boardDims
  }

  get boardInitialBounds() {
    const { center } = this.boardParams
    const initialBounds = new Box3().setFromCenterAndSize(center, this.boardInitialDims)
    return initialBounds
  }

  get boardBounds() {
    return this.boardData.bounds
  }

  set boardBounds(val: Box2) {
    this.boardData.bounds = val
  }

  get boardElevation() {
    return this.boardData.elevation
  }

  set boardElevation(val: number) {
    this.boardData.elevation = val
  }

  adjustBoardBounds() {
    const boardCenter = this.boardParams.center
    const boardBounds = new Box2(boardCenter.clone(), boardCenter.clone())
    for (const patch of this.chunk) {
      const blocks = patch.iterBlocksQuery()
      for (const block of blocks) {
        if (patch.isWithinBoard(block.pos)) {
          boardBounds.expandByPoint(asVect2(block.pos))
        }
      }
    }
    // final bounds
    return boardBounds
  }

  isWithinBoard(pos: Vector2) {
    const { radius, center } = this.boardParams
    const distToCenter = pos.distanceTo(asVect2(center))
    return distToCenter <= radius
  }

  isBufferWithinBoard(buffPos: Vector2, buffer: Uint16Array) {
    const { radius, center } = this.boardParams
    if (buffPos) {
      // const marginBlock = buffer[0]
      // const lastMarginBlock = buffer[buffer.length - 1]
      // const firstBlock = buffer[1]
      // const isFull = buffer.slice(1, -1).find(val => val === 0) === undefined
      const lastBlock = buffer[buffer.length - 2]
      const isEmpty = buffer.slice(1, -1).reduce((sum, val) => sum + val, 0) === 0
      // const heightDiff = Math.abs(blockPos.y - center.y)
      const centerDist = buffPos.distanceTo(asVect2(center))
      // pos inside board
      const isInside = centerDist <= radius && !isEmpty && lastBlock === 0
      // if (isInside) {
      //     this.boardBounds = this.boardBounds || new Box2(asVect2(blockPos), asVect2(blockPos))
      //     this.boardBounds.expandByPoint(asVect2(blockPos))
      //     return true
      // }
      return isInside
    }
    // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
    return false
  }

  overlapsBoard(bounds: Box2) {
    const dummyPatch = new GroundPatch(bounds)
    const patchBlocks = dummyPatch.iterBlocksQuery(bounds)
    for (const block of patchBlocks) {
      if (this.isWithinBoard(asVect2(block.pos))) {
        return true
      }
    }
    return false
  }

  genBoardBuffer(center: Vector3) {
    this.boardParams.center = center
    this.boardBounds.setFromPoints([asVect2(center)])
    const emptyBlock = ChunkContainer.dataEncoder(BlockType.NONE)
    const boardBuffer = new ChunkContainer(this.boardInitialBounds, 1)
    // fill buffer from cache
    this.localCache.fillTargetChunk(boardBuffer)
    const chunkBuffers = boardBuffer.iterChunkBuffers()
    for (const chunkBuff of chunkBuffers) {
      // const empty = chunkBuff.data.reduce((sum, val) => sum + val, 0) === 0
      // const full = chunkBuff.data.find(val => val === 0) === undefined
      if (this.isBufferWithinBoard(chunkBuff.pos, chunkBuff.data)) {
        this.boardBounds.expandByPoint(chunkBuff.pos)
        const marginBlock = ChunkContainer.dataEncoder(chunkBuff.data[0] || BlockType.NONE)
        chunkBuff.data[0] = marginBlock
        // chunkBuff.data.fill(33,0,2)
        // find last empty block
        const surfaceIndex = Math.max(chunkBuff.data.findIndex(val => !val) - 1, 0)
        const surfaceBlock = ChunkContainer.dataEncoder(chunkBuff.data[surfaceIndex] || BlockType.NONE, BlockMode.CHECKERBOARD)
        const undergroundBlock = ChunkContainer.dataEncoder(chunkBuff.data[surfaceIndex] || BlockType.NONE)
        // const groundBlock = ChunkContainer.dataEncoder(chunkBuff.data[1] || BlockType.NONE, BlockMode.CHECKERBOARD)
        const { thickness: boardThickness } = this.boardParams
        for (let i = 0; i < boardThickness; i++) {
          chunkBuff.data[i] = undergroundBlock
        }
        chunkBuff.data[boardThickness] = surfaceBlock
        chunkBuff.data.fill(emptyBlock, boardThickness + 1)
      } else {
        chunkBuff.data.forEach((val, i) => {
          chunkBuff.data[i] = ChunkContainer.dataEncoder(val)
        })
      }
      boardBuffer.writeBuffer(chunkBuff.localPos, chunkBuff.data)
    }
    const finalBounds = asBox3(this.boardBounds)
    finalBounds.min.y = boardBuffer.bounds.min.y
    finalBounds.max.y = boardBuffer.bounds.max.y
    const finalBoardBuffer = new ChunkContainer(finalBounds, 1)
    ChunkContainer.copySourceToTarget(boardBuffer, finalBoardBuffer)
    const boardSpawnedItems = this.localCache.querySpawnedItems(finalBoardBuffer.bounds)
    // add trimmed items
    for (const itemChunk of boardSpawnedItems) {
      // const spawnPos = itemChunk.bounds.getCenter(new Vector3())
      // const spawnLocalPos = asVect2(boardBuffer.toLocalPos(spawnPos))
      // const treeBuff = []
      // boardBuffer.writeBuffer(spawnLocalPos, treeBuff);
      ChunkContainer.copySourceToTarget(itemChunk, finalBoardBuffer)
    }
    // const indexedPatchEntries = this.localCache.indexedPatchEntries
    // for (const [patchKey, cachedData] of indexedPatchEntries){

    // }
    // boardBuffer.rawData.fill(33)
    // for (const boardChunk of this.boardChunks) {
    //   ChunkContainer.copySourceToTarget(boardChunk, boardBuffer)
    // }
    return finalBoardBuffer
  }

  genBoardData() {
    const dummyPatch = new GroundPatch(this.boardBounds)

    // convert blocks to board data format
    const boardBlocks = dummyPatch.iterBlocksQuery()
    const data = []
    for (const block of boardBlocks) {
      // const blockType = this.isWithinBoard(asVect2(block.pos))
      //   ? block.data.type
      //   : BlockType.NONE
      const blockCat = this.isWithinBoard(asVect2(block.pos)) ? blockTypeCategoryMapper(BlockType.GRASS) : BlockCategory.EMPTY
      // const boardElement: BoardBlock = {
      //   type: blockType,
      //   category: blockCat,
      // }
      // data.push(boardElement)
      data.push(blockCat)
    }
    // PatchContainer.copySourceOverTargetContainer(boardContainer, this)
    const boardData: BoardContent = { bounds: this.boardBounds, elevation: this.boardParams.center.y, data }
    return boardData
  }

}