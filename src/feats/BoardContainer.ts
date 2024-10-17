import { Box2, Vector2, Vector3, Vector3Like } from 'three'

import { Block, PatchBlock } from '../common/types'
import { asVect2, asVect3 } from '../common/utils'
import {
  BlockType,
  PatchContainer,
  GroundPatch,
  ProcLayer,
  WorldComputeProxy,
} from '../index'
import { PseudoDistributionMap } from '../datacontainers/RandomDistributionMap'
import { findBoundingBox } from '../common/math'
import { BlockData, BlockMode } from '../datacontainers/GroundPatch'
import { ItemType } from '../misc/ItemsInventory'

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

export type BoardInputParams = {
  radius: number
  thickness: number
}

export type BoardInput = BoardInputParams & { center: Vector3 }

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
/**
 * Building steps
 * - compute initial bounds from input
 * - fill with ground blocks
 * - override original blocks and adjust external bounds
 * - add board entities (trimmed trees, holes)
 *
 */
export class BoardContainer extends GroundPatch {
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
    const obstacles: Block[] = await this.retrieveAndTrimTrees()
    const holes: Block[] = this.getHolesAreasBis(obstacles)
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
    const items: Record<ItemType, Vector3[]> = await WorldComputeProxy.instance.queryOvergroundItems(
      this.bounds,
    )
    const boardItems = []
    const itemsChunks = []
    for (const [itemType, spawnInstances] of Object.entries(items)) {
      const withinBoardItems = spawnInstances.filter(spawnOrigin => this.isWithinBoard(spawnOrigin))
      for await (const itemPos of withinBoardItems) {
        // const itemChunk = await ItemsInventory.getItemChunkInstance(itemType, itemPos)
        // trim chunk
        // itemChunk?.bounds.min.y=
        // itemChunk?.bounds.max.y=
        // itemsChunks.push(itemChunk)

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
    entityRadius = 2,
  ) {
    const intersectsEntity = (testRange: Box2, entityPos: Vector2) =>
      testRange.distanceToPoint(entityPos) <= entityRadius
    const spawnLocs = distMap.querySpawnLocations(
      boardContainer.bounds,
      intersectsEntity,
      () => 1,
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

  digGroundHole(holeBlock: Block) {
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

  getHolesAreas(boardContainer: GroundPatch, forbiddenBlocks: Block[]) {
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
    return holesMulti.map(({ pos, data }) => ({ pos, data }) as Block)
  }

  getHolesAreasBis(forbiddenBlocks: Block[]) {
    // prevent holes from spreading over forbidden blocks
    const isForbiddenPos = (testPos: Vector3) =>
      !!forbiddenBlocks.find(block => block.pos.equals(testPos))
    const blocks = this.iterBlocksQuery()
    const holes: Block[] = []
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
    return holes.map(({ pos, data }) => ({ pos, data }) as Block)
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
