import { Box2, Vector2, Vector3, Vector3Like } from 'three'

import { Block, EntityData, PatchBlock } from '../common/types'
import { asVect2, asVect3 } from '../common/utils'
import {
  BlockType,
  BoardUtils,
  DataContainer,
  GroundPatch,
  ProcLayer,
  WorldComputeProxy,
  WorldConf,
} from '../index'
import { PseudoDistributionMap } from '../datacontainers/RandomDistributionMap'
import { findBoundingBox } from '../common/math'
import { BlockMode, PatchStub } from '../datacontainers/GroundPatch'

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
    case BlockType.TREE_TRUNK:
      return BlockCategory.OBSTACLE
    case BlockType.BOARD_HOLE:
      return BlockCategory.HOLE
    default:
      return BlockCategory.FLAT
  }
}

export type BoardStub = PatchStub & {
  input: BoardInput
  output: BoardOutputData
}

/**
 * Board entities distribution conf
 */
// Start positions
// const startPosDistParams = {
//   aleaSeed: 'boardStartPos',
//   minDistance: 10,
//   maxDistance: 16,
//   tries: 20,
// }

// Holes
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
 * Board data export format:
 * - bounds
 * - data as array of block's type
 */
export class BoardContainer extends GroundPatch {
  // static prevContainerBounds: Box2 | undefined
  // static singleton: BoardContainer
  // static get instance(){
  //   return this.singleton
  // }
  static holesDistribution = new PseudoDistributionMap(
    undefined,
    holesDistParams,
  )

  static holesMapDistribution = new ProcLayer('holesMap')
  // static startPosDistribution = new PseudoDistributionMap(undefined, startPosDistParams)

  // board input params
  input: BoardInput = {
    center: new Vector3(),
    radius: 0,
    thickness: 0,
  }

  // board data output
  output: BoardOutputData & { overridingContainer: GroundPatch | undefined } = {
    origin: new Vector3(),
    size: new Vector2(),
    data: [],
    overridingContainer: undefined,
  }

  entities: {
    obstacles: EntityData[]
    holes: EntityData[]
  } = {
    obstacles: [],
    holes: [],
  }
  // swapContainer!: GroundPatch //Uint32Array

  /**
   *
   * @param center
   * @param radius
   * @param previousBounds  // used for handling previous board removal
   * @returns
   */
  static getInitialBounds = (
    center: Vector3,
    radius: number,
    previousBounds?: Box2,
  ) => {
    // const previousBounds = BoardContainer.prevContainerBounds
    const defaultBounds = new Box2().setFromCenterAndSize(
      asVect2(center),
      new Vector2(radius, radius).multiplyScalar(2),
    )
    return previousBounds ? defaultBounds.union(previousBounds) : defaultBounds
  }

  constructor(
    boardCenter = new Vector3(),
    boardParams?: BoardInputParams,
    lastBoardBounds?: Box2,
  ) {
    super(
      BoardContainer.getInitialBounds(
        boardCenter,
        boardParams?.radius || 0,
        lastBoardBounds,
      ),
    )
    const { input } = this
    input.center = boardCenter.clone().floor()
    input.radius = boardParams?.radius || input.radius
    input.thickness = boardParams?.thickness || input.thickness

    BoardContainer.holesMapDistribution.sampling.periodicity = 0.25
  }

  get overridingContainer() {
    if (!this.output.overridingContainer) {
      const overridingContainer = this.shapeBoard()
      // const boardEntitiesBlocks: Block[] = []
      const obstacles: Block[] = this.trimTrees(overridingContainer)
      const holes: Block[] = this.getHolesAreasBis(
        overridingContainer,
        obstacles,
      )
      holes.forEach(block => this.digGroundHole(block, overridingContainer))
      this.output.origin = asVect3(
        overridingContainer.bounds.min,
        this.input.center.y,
      )
      overridingContainer.bounds.getSize(this.output.size)
      this.output.overridingContainer = overridingContainer
      DataContainer.copySourceOverTargetContainer(overridingContainer, this)
    }
    return this.output.overridingContainer
  }

  async retrieveBoardData() {
    await this.fillGroundData()
    // populate external entities (trees) from world-compute
    const trees = await WorldComputeProxy.instance.queryEntities(this.bounds)
    // query local entities (holes)
    // const holes = this.queryLocalEntities(boardContainer, BoardContainer.holesDistribution)
    this.entities.obstacles.push(...trees)
  }

  isWithinBoard(blockPos: Vector3) {
    let isInsideBoard = false
    const { thickness, radius, center } = this.input
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
  };

  *iterBoardBlock() {
    const blocks = this.iterBlocksQuery(undefined, true)
    // const blocks = this.iterPatchesBlocks()
    for (const block of blocks) {
      // discard blocks not included in board shape
      if (this.isWithinBoard(block.pos)) {
        yield block
      }
    }
  }

  /**
   * Override original ground blocks with board blocks
   * and adjust final board bounds
   * @returns
   */
  shapeBoard() {
    const { center } = this.input
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    const tempContainer = new GroundPatch(this.bounds)
    const finalBounds = new Box2(asVect2(center), asVect2(center))
    const boardBlocks = this.iterBlocksQuery(undefined, false)
    // const boardBlocks = this.iterBoardBlock()
    for (const block of boardBlocks) {
      // tempContainer.setBlock(boardBlock.pos, boardBlock.data, false)
      if (this.isWithinBoard(block.pos)) {
        block.data.mode = BlockMode.BOARD_CONTAINER
        block.data.level = center.y
        // override block data
        tempContainer.writeBlockData(block.index, block.data)
        finalBounds.expandByPoint(asVect2(block.pos))
      }
    }

    // copy content over final container
    const bounds = new Box2(asVect2(center), asVect2(center))
    bounds.expandByVector(new Vector2(1, 1).multiplyScalar(10))
    const finalBoardContainer = new GroundPatch(finalBounds)
    DataContainer.copySourceOverTargetContainer(
      tempContainer,
      finalBoardContainer,
    )
    return finalBoardContainer
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

  digGroundHole(holeBlock: Block, boardContainer: GroundPatch) {
    holeBlock.data.type = BlockType.BOARD_HOLE
    holeBlock.data.level -= 1 // dig hole in the ground
    holeBlock.data.mode = BlockMode.DEFAULT
    boardContainer.setBlock(holeBlock.pos, holeBlock.data)
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

  getHolesAreasBis(boardContainer: GroundPatch, forbiddenBlocks: Block[]) {
    // prevent holes from spreading over forbidden blocks
    const isForbiddenPos = (testPos: Vector3) =>
      !!forbiddenBlocks.find(block => block.pos.equals(testPos))
    const blocks = boardContainer.iterBlocksQuery()
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

  trimTrees(boardContainer: GroundPatch) {
    const trunks = this.entities.obstacles
      .map(entity => {
        const entityCenter = entity.bbox.getCenter(new Vector3())
        const entityCenterBlock = boardContainer.getBlock(entityCenter)
        entityCenter.y = entity.bbox.min.y
        return entityCenterBlock
      })
      .filter(
        trunkBlock => trunkBlock && this.isWithinBoard(trunkBlock.pos),
      ) as PatchBlock[]

    trunks.forEach(trunkBlock => {
      trunkBlock.data.type = BlockType.TREE_TRUNK
      trunkBlock.data.mode = BlockMode.DEFAULT
      trunkBlock.data.level += 1
      boardContainer.setBlock(trunkBlock.pos, trunkBlock.data)
    })
    return trunks.map(({ pos, data }) => ({ pos, data }) as Block)
  }

  override fromStub(boardStub: BoardStub) {
    super.fromStub(boardStub)
    const { input, output } = boardStub
    this.input = input
    this.output = { ...output, overridingContainer: undefined }
    return this
  }

  override toStub(): BoardStub {
    const { input, output } = this
    const boardStub: BoardStub = {
      ...super.toStub(),
      input,
      output,
    }
    return boardStub
  }

  exportBoardData() {
    const boardBlocks = this.overridingContainer.iterBlocksQuery()
    for (const block of boardBlocks) {
      const blockType = block.data.type
      const blockCat = blockTypeCategoryMapper(blockType)
      const boardBlock: BoardBlock = {
        type: blockType,
        category: blockCat,
      }
      this.output.data.push(boardBlock)
    }
    const { origin, size, data } = this.output
    const board: BoardOutputData = { origin, size, data }
    if (WorldConf.debug.board.splitSidesColoring) {
      const boardSides = BoardUtils.splitBoard(board)
      // boardSides.first.forEach(blockPos => {
      //   const block = this.getBlock(blockPos)
      //   if (block) {
      //     block.data.type = BlockType.DBG_ORANGE
      //     this.setBlock(block.pos, block.data)
      //   }
      // })
      let index = 0
      board.data.forEach(boardBlock => {
        if (boardBlock.type) {
          const blockData = this.overridingContainer.readBlockData(index)
          const blockPos = this.overridingContainer.getLocalPosFromIndex(index)
          if (blockData) {
            blockData.type = BlockType.DBG_ORANGE
            this.setBlock(blockPos, blockData, true)
          }
        }
        index++
      })
      console.log(boardSides)
    }
    return board
  }
}
