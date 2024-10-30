import { Box2, Vector2, Vector3, Vector3Like } from 'three'

import { BlockData, GroundBlock, PatchBlock } from '../utils/types'
import { asVect2, asVect3 } from '../utils/common'
import {
  ProcLayer,
  WorldComputeProxy,
  BlockMode,
  WorldContainer,
  BoardPatch,
} from '../index'
import { PseudoDistributionMap } from './RandomDistributionMap'
import { findBoundingBox } from '../utils/math'
import { ItemType } from '../misc/ItemsInventory'
import { GroundPatch } from './GroundPatch'
import { BlockType } from '../procgen/Biome'

export enum BlockCategory {
  FLAT = 0,
  HOLE = 1,
  OBSTACLE = 2,
}

export type BoardBlock = {
  type: BlockType
  category: BlockCategory
}

export type BoardOutputData = {
  origin: Vector3Like
  size: Vector2
  data: BoardBlock[]
}

export type BoardParams = {
  center: Vector3
  radius: number
  thickness: number
}

// export type BoardInput = BoardInputParams & { center: Vector3 }

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

// Board hole entities distribution conf
const holesDistParams = {
  aleaSeed: 'boardHoles',
  minDistance: 10,
  maxDistance: 16,
  tries: 20,
}

export class BoardContainer extends WorldContainer {
  boardParams: BoardParams = {
    center: new Vector3,
    radius: 0,
    thickness: 0
  }
  boardBounds = new Box2()
  static boardHolesLayer = new ProcLayer('holesMap')
  override patchConstructor = (key: string) => new BoardPatch(key, this.boardParams);

  constructor(boardRadius: number, boardThickness: number) {
    super()
    this.boardParams.radius = boardRadius
    this.boardParams.thickness = boardThickness
    BoardContainer.boardHolesLayer.sampling.periodicity = 0.25
    // this.center = boardCenter
  }

  /**
   * Override default behavior to reset patch index,
   */
  override rebuildIndexAroundPosAndRad(center: Vector2 | Vector3, radius = this.boardParams.radius) {
    // clear previous patches to start from fresh data
    this.patchLookup = {}
    const patchLookup = center instanceof Vector2 ? super.rebuildIndexAroundPosAndRad(center, radius) :
      super.rebuildIndexAroundPosAndRad(asVect2(center), radius)
    this.boardParams.center = center instanceof Vector3 ? center : asVect3(center)
    this.patchLookup = patchLookup || this.patchLookup
    return patchLookup
  }

  async build() {
    // populate patch data (should be retrieved from cache)
    const pendingPatches = this.fillAllMissing()
    // this.boardBounds = new Box2(asVect2(this.center), asVect2(this.center))
    // const bakedPatches = Promise.all(pendingPatches.map(patchRequest => patchRequest.then(patch => {
    //   return this.overridePatchData(patch)
    // })))
    return Promise.all(pendingPatches)
  }

  isWithinBoard(blockPos: Vector3) {
    let isInsideBoard = false
    const { thickness, radius, center } = this.boardParams
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - center.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(center))
      isInsideBoard = dist <= radius && heightDiff <= thickness
    }
    return isInsideBoard
  }

  isOverlappingBoard = (bounds: Box2) => {
    const overlapping = this.patches.find(patch => {
      const patchBlocks = patch.iterBlocksQuery(bounds)
      for (const block of patchBlocks) {
        if (this.isWithinBoard(block.pos)) {
          return patch
        }
      }
      return
    })

    return overlapping
  }

  overridePatchData(groundPatch: GroundPatch) {
    const blocks = groundPatch.iterBlocksQuery(undefined, false)
    // const boardBlocks = this.iterBoardBlock()
    for (const block of blocks) {
      // tempContainer.setBlock(boardBlock.pos, boardBlock.data, false)
      if (this.isWithinBoard(block.pos)) {
        block.data.mode = BlockMode.BOARD_CONTAINER
        // block.data.type = BlockType.MUD
        block.data.level = this.center.y
        // override block data
        groundPatch.writeBlockData(block.index, block.data)
        this.boardBounds.expandByPoint(asVect2(block.pos))
      }
    }
    console.log(this.boardBounds)
  }

  async addTrimmedTrees() {
    // request all entities belonging to the board
    const items: Record<ItemType, Vector3[]> =
      await WorldComputeProxy.instance.queryOvergroundItems(this.bounds)
    const boardItems = []
    for (const [, spawnInstances] of Object.entries(items)) {
      const withinBoardItems = spawnInstances.filter(spawnOrigin =>
        this.isWithinBoard(spawnOrigin),
      )
      for await (const itemPos of withinBoardItems) {
        const boardBlock = this.getBlock(itemPos)
        if (boardBlock) {
          boardBlock.pos.y += 1
          boardBlock.data.level += 1
          boardBlock.data.type = BlockType.TRUNK
          boardBlock.data.mode = BlockMode.DEFAULT
          this.setBlock(boardBlock.pos, boardBlock.data)
          boardItems.push(boardBlock.pos)
        }
      }
    }
    const boardItemsBlocks = boardItems.map(pos => ({ pos, type: 10 }))
    return boardItemsBlocks
  }
}

/**
 * Building steps
 * - compute initial bounds from input
 * - fill with ground blocks
 * - override original blocks and adjust external bounds
 * - add board entities (trimmed trees, holes)
 *
 */
export class BoardLegacyContainer extends WorldContainer {
  static holesDistribution = new PseudoDistributionMap(
    undefined,
    holesDistParams,
  )

  static holesMapDistribution = new ProcLayer('holesMap')

  center
  radius
  thickness

  constructor(boardCenter = new Vector3(), boardParams?: BoardInputParams) {
    super()
    this.center = boardCenter.clone().floor() || new Vector3()
    this.radius = boardParams?.radius || 0
    this.thickness = boardParams?.thickness || 0
    BoardContainer.holesMapDistribution.sampling.periodicity = 0.25
  }

  async make() {
    await this.fillAndShapeBoard()
    const obstacles = await this.retrieveAndTrimTrees()
    const holes = this.getHolesAreasBis(obstacles)
    holes.forEach(block => this.digGroundHole(block))
  }

  isWithinBoard(blockPos: Vector3) {
    let isInsideBoard = false
    const { thickness, radius, center } = this
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - center.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(center))
      isInsideBoard = dist <= radius && heightDiff <= thickness
    }
    return isInsideBoard
  }

  isOverlappingWithBoard = (bounds: Box2) => {
    const testedBlocks = this.iterBlocksQuery(bounds)
    for (const block of testedBlocks) {
      if (this.isWithinBoard(block.pos)) {
        return true
      }
    }
    return false
  }

  /**
   * Override original ground blocks with board blocks
   * and adjust final board bounds
   * @returns
   */
  async fillAndShapeBoard() {
    const { center, radius } = this
    const defaultBounds = new Box2().setFromCenterAndSize(
      asVect2(center),
      new Vector2(radius, radius).multiplyScalar(2),
    )
    const tempContainer = new GroundPatch(defaultBounds)
    await tempContainer.fillGroundData()
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    const finalBounds = new Box2(asVect2(center), asVect2(center))
    const blocks = tempContainer.iterBlocksQuery(undefined, false)
    // const boardBlocks = this.iterBoardBlock()
    for (const block of blocks) {
      // tempContainer.setBlock(boardBlock.pos, boardBlock.data, false)
      if (this.isWithinBoard(block.pos)) {
        block.data.mode = BlockMode.BOARD_CONTAINER
        block.data.level = center.y
        // override block data
        tempContainer.writeBlockData(block.index, block.data)
        finalBounds.expandByPoint(asVect2(block.pos))
      }
    }
    // copy content over board container
    this.init(finalBounds)
    PatchContainer.copySourceOverTargetContainer(tempContainer, this)
  }

  async retrieveAndTrimTrees() {
    // request all entities belonging to the board
    const items: Record<ItemType, Vector3[]> =
      await WorldComputeProxy.instance.queryOvergroundItems(this.bounds)
    const boardItems = []
    for (const [, spawnInstances] of Object.entries(items)) {
      const withinBoardItems = spawnInstances.filter(spawnOrigin =>
        this.isWithinBoard(spawnOrigin),
      )
      for await (const itemPos of withinBoardItems) {
        const boardBlock = this.getBlock(itemPos)
        if (boardBlock) {
          boardBlock.pos.y += 1
          boardBlock.data.level += 1
          boardBlock.data.type = BlockType.TRUNK
          boardBlock.data.mode = BlockMode.DEFAULT
          this.setBlock(boardBlock.pos, boardBlock.data)
          boardItems.push(boardBlock.pos)
        }
      }
    }
    const boardItemsBlocks = boardItems.map(pos => ({ pos, type: 10 }))
    return boardItemsBlocks
  }

  // perform local query
  queryLocalEntities(
    boardContainer: GroundPatch,
    distMap: PseudoDistributionMap,
    itemRadius = 2,
  ) {
    const itemDims = new Vector2(itemRadius, itemRadius)
    const spawnLocs = distMap.querySpawnLocations(
      boardContainer.bounds,
      itemDims,
    )
    const entities = spawnLocs
      .map(loc => {
        const startPos = asVect3(loc)
        const block = boardContainer.getBlock(startPos)
        return block
      })
      .filter(block => block && this.isWithinBoard(block.pos)) as PatchBlock[]
    // TODO prune entities spawning over existing entities
    return entities
  }

  isGroundHole(testPos: Vector3) {
    return BoardContainer.holesMapDistribution.eval(testPos) < 0.15
  }

  digGroundHole(holeBlock: GroundBlock) {
    holeBlock.data.type = BlockType.HOLE
    holeBlock.data.level -= 1 // dig hole in the ground
    holeBlock.data.mode = BlockMode.DEFAULT
    this.setBlock(holeBlock.pos, holeBlock.data)
  }

  getHolesMonoBlocks(boardContainer: GroundPatch) {
    const holesSingleBlocks = this.queryLocalEntities(
      boardContainer,
      BoardContainer.holesDistribution,
    ).map(({ pos, data }) => ({ pos, data }))
    return holesSingleBlocks
  }

  getHolesAreas(boardContainer: GroundPatch, forbiddenBlocks: GroundBlock[]) {
    const forbiddenPos = forbiddenBlocks.map(({ pos }) => asVect2(pos))
    const holesMono = this.queryLocalEntities(
      boardContainer,
      BoardContainer.holesDistribution,
    )
    const holesMulti: PatchBlock[] = []
    // for each monoblock hole, find maximum bounding box around
    holesMono.forEach(hole => {
      const pos = asVect2(hole.pos)
      const holeBounds = findBoundingBox(
        pos,
        forbiddenPos,
        boardContainer.bounds,
      )
      const holeBlocks = boardContainer.iterBlocksQuery(holeBounds)
      for (const block of holeBlocks) {
        holesMulti.push(block)
      }
    })
    return holesMulti.map(({ pos, data }) => ({ pos, data }) as GroundBlock)
  }

  getHolesAreasBis(forbiddenBlocks: any[]) {
    // prevent holes from spreading over forbidden blocks
    const isForbiddenPos = (testPos: Vector3) =>
      !!forbiddenBlocks.find(block => block.pos.equals(testPos))
    const blocks = this.iterBlocksQuery()
    const holes: PatchBlock[] = []
    for (const block of blocks) {
      const testPos = block.pos
      if (
        this.isWithinBoard(testPos) &&
        this.isGroundHole(testPos) &&
        !isForbiddenPos(testPos)
      ) {
        holes.push(block)
      }
    }
    return holes.map(({ pos, data }) => ({ pos, data }) as GroundBlock)
  }

  /**
   * Convert board ground container to exported format
   */
  exportBoardData() {
    const origin = asVect3(this.bounds.min, this.center.y)
    const size = this.bounds.getSize(new Vector2())
    // convert board blocks to board data
    const boardBlocks = this.iterBlocksQuery()
    const data = []
    for (const block of boardBlocks) {
      const blockType = this.isWithinBoard(block.pos)
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
    const board: BoardOutputData = { origin, size, data }
    return board
  }

  /**
   * Convert previously exported board data to ground container
   * @param board exported data
   * @returns ground container
   */
  importBoardData(board: BoardOutputData) {
    const origin = asVect2(board.origin as Vector3)
    const end = origin.clone().add(board.size)
    const bounds = new Box2(origin, end)
    this.init(bounds)
    // copy cource content over target container
    const targetContainer = this // new GroundPatch(bounds)
    const blocks = this.iterBlocksQuery() // BoardUtils.iterBoardData(board)
    const boardLevel = board.origin.y
    let index = 0
    for (const block of blocks) {
      const boardData = board.data[index++]
      if (boardData) {
        const blockData: BlockData = {
          level: boardLevel,
          type: boardData.type,
          mode: BlockMode.BOARD_CONTAINER,
        }
        targetContainer.setBlock(block.pos, blockData)
      }
    }
    return targetContainer
  }
}
