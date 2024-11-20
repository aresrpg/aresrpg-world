import { Box2, Box3, Vector2, Vector3 } from 'three'

import { asVect2, parseChunkKey } from '../utils/common'
import {
  ProcLayer,
  BoardChunkBuffer,
  WorldChunkIndexer,
  WorldConf,
  ChunkContainer,
  BlockMode,
} from '../index'
import { GroundPatch } from './GroundPatch'
import { BlockType } from '../procgen/Biome'
import { defaultDataEncoder } from './ChunkContainer'
import { CaveChunkMask, GroundChunk } from './ChunkFactory'

export enum BlockCategory {
  FLAT = 0,
  HOLE = 1,
  OBSTACLE = 2,
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

const getChunkYId = (y: number) => Math.floor(y / WorldConf.instance.chunkDimensions.y)

export class BoardCache extends WorldChunkIndexer<ChunkContainer> {
  center = new Vector3
  radius: number
  thickness: number
  constructor(radius: number, thickness: number) {
    super()
    this.radius = radius
    this.thickness = thickness
  }

  get cachedChunks() {
    const cachedChunks = this.indexedChunksEntries
      .map(([, chunk]) => chunk)
      .filter(chunk => chunk)
    return cachedChunks as ChunkContainer[]
  }

  async cacheAroundPos(center: Vector3) {
    const { thickness, radius } = this
    const yMinId = getChunkYId(center.y - thickness)
    const yMaxId = getChunkYId(center.y + thickness)
    this.center = center
    super.reindexAroundPos(asVect2(center), radius)
    // fill new chunks buffers and store in index
    for await (const patchKey of this.patchIndexes) {
      const patchChunksEntries = Object.entries(this.indexed[patchKey])
      // cache chunks only related to boards
      for await (const [chunkKey, chunkVal] of patchChunksEntries) {
        const chunkId = parseChunkKey(chunkKey)
        if (!chunkVal && chunkId.y >= yMinId && chunkId.y <= yMaxId) {
          // mark chunk for later board gen
          const chunk = new GroundChunk(chunkKey, 1, defaultDataEncoder)
          const cavesMask = new CaveChunkMask(chunkKey, 1)
          await cavesMask.bake()
          await chunk.bake(undefined, cavesMask)
          this.indexed[patchKey][chunkKey] = chunk
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

  fillChunkBuffer(buffer: ChunkContainer) {
    this.cachedChunks.forEach(cacheChunk => {
      ChunkContainer.copySourceToTarget(cacheChunk, buffer)
    })
  }

}

export class BoardContainer {
  localCache: BoardCache
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
    const { boardSettings } = WorldConf.instance
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
    const boardDims = new Vector3(2 * radius, thickness, 2 * radius)
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

  isWithinBoard(buffPos: Vector2, buffer: Uint16Array) {
    const { thickness, radius, center } = this.boardParams
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

  genBoardBuffer(center: Vector3) {
    this.boardParams.center = center
    const emptyBlock = ChunkContainer.dataEncoder(BlockType.NONE)
    const boardBuffer = new ChunkContainer(this.boardInitialBounds, 1)
    // fill buffer from cache
    this.localCache.fillChunkBuffer(boardBuffer)
    const chunkBuffers = boardBuffer.iterChunkBuffers()
    for (const chunkBuff of chunkBuffers) {
      // const empty = chunkBuff.data.reduce((sum, val) => sum + val, 0) === 0
      // const full = chunkBuff.data.find(val => val === 0) === undefined
      if (this.isWithinBoard(chunkBuff.pos, chunkBuff.data)) {
        const marginBlock = ChunkContainer.dataEncoder(chunkBuff.data[0] || BlockType.NONE)
        chunkBuff.data[0] = marginBlock
        // chunkBuff.data.fill(33,0,2)
        const groundBlock = ChunkContainer.dataEncoder(chunkBuff.data[1] || BlockType.NONE, BlockMode.BOARD_CONTAINER)
        chunkBuff.data[1] = groundBlock
        chunkBuff.data.fill(emptyBlock, 2)
      } else {
        chunkBuff.data.forEach((val, i) => {
          chunkBuff.data[i] = ChunkContainer.dataEncoder(val)
        })
      }
      boardBuffer.writeBuffer(chunkBuff.localPos, chunkBuff.data)
    }
    // boardBuffer.rawData.fill(33)
    // for (const boardChunk of this.boardChunks) {
    //   ChunkContainer.copySourceToTarget(boardChunk, boardBuffer)
    // }
    return boardBuffer
  }

  async genBoardData() {
    // retrieve missing patches
    const otf_gen = await this.otfGen()
    for await (const _board_patch of otf_gen);
    const { center } = this.boardParams
    const boardElevation = this.findPatch(center)?.getBlock(center)?.pos.y || 0
    const boardBounds = this.adjustBoardBounds()
    this.boardElevation = boardElevation
    this.boardBounds = boardBounds
    // const origin = asVect3(boardBounds.min, boardElevation)
    // const size = boardBounds.getSize(new Vector2())
    const finalBoardContainer = new BoardChunkBuffer(boardBounds, this)
    // copy overlapping content from all board patches into single container
    for (const patch of this.patches) {
      GroundPatch.copySourceOverTargetContainer(patch, finalBoardContainer)
    }
    // convert blocks to board data format
    const boardBlocks = finalBoardContainer.iterBlocksQuery()
    const data = []
    for (const block of boardBlocks) {
      const blockType = finalBoardContainer.isWithinBoard(block.pos)
        ? block.data.type
        : BlockType.NONE
      const blockCat = blockTypeCategoryMapper(blockType)
      const boardElement: BoardBlock = {
        type: blockType,
        category: blockCat,
      }
      data.push(boardElement)
    }
    // PatchContainer.copySourceOverTargetContainer(boardContainer, this)
    const boardData: BoardContent = { bounds: boardBounds, elevation: boardElevation, data }
    return boardData
  }

}