import { Box2, Vector2, Vector3 } from 'three'

import { Block, EntityData, PatchBlock } from '../common/types'
import { asBox2, asVect2, asVect3 } from '../common/utils'
import { BlockType, GroundPatch, WorldCompute, WorldConf } from '../index'

import { PseudoDistributionMap } from './RandomDistributionMap'
import { BlockMode, BlocksPatch, PatchStub } from './BlocksPatch'

export type BoardParams = {
  radius: number,
  maxThickness: number,
  keepLast?: boolean
}

export type BoardRawStub = PatchStub & {
  entities: {
    startPositions: Block[],
    holes: Block[],
    obstacles: Block[],
  },
  params: BoardParams & { center: Vector3 }
}

const defaultBoardParams: BoardParams = {
  radius: 0,
  maxThickness: 0,
  keepLast: false
}

/**
 * Board entities distribution conf
 */
// Start positions
const startPosDistParams = {
  aleaSeed: 'boardStartPos',
  minDistance: 10,
  maxDistance: 16,
  tries: 20,
}

// Holes
const holesDistParams = {
  aleaSeed: 'boardHoles',
  minDistance: 10,
  maxDistance: 16,
  tries: 20,
}

export class BoardContainer extends GroundPatch {
  // used for handling previous board removal
  static prevContainerBounds: Box2 | undefined
  // static singleton: BoardContainer
  // static get instance(){
  //   return this.singleton
  // }
  static holesDistribution = new PseudoDistributionMap(undefined, holesDistParams)
  static startPosDistribution = new PseudoDistributionMap(undefined, startPosDistParams)

  // board instance params
  center
  radius
  thickness
  swapContainer!: BlocksPatch //Uint32Array

  static getInitialBounds = (center: Vector3, radius: number, includePrevBounds = false) => {
    const initialBounds = new Box2()
      .setFromCenterAndSize(asVect2(center), new Vector2(radius, radius)
        .multiplyScalar(2))
    if (includePrevBounds && BoardContainer.prevContainerBounds) {
      initialBounds.union(BoardContainer.prevContainerBounds)
    }
    return initialBounds
  }

  constructor(boardCenter = new Vector3(), boardParams = defaultBoardParams) {
    super(BoardContainer.getInitialBounds(boardCenter, boardParams.radius, boardParams.keepLast))
    const { radius, maxThickness } = boardParams
    this.radius = radius
    this.center = boardCenter.clone().floor()
    this.thickness = maxThickness
  }

  getOriginalBounds() {
    const { radius, center } = this
    return BoardContainer.getInitialBounds(center, radius)
  }

  isWithinBoard(blockPos: Vector3) {
    let isInsideBoard = false
    const { thickness, radius } = this
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - this.center.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(this.center))
      isInsideBoard = dist <= radius && heightDiff <= thickness
    }
    return isInsideBoard
  }
  
  overrideBlock(block: PatchBlock) {
    const blockData = block.data
    if (this.isWithinBoard(block.pos)) {
      blockData.mode = BlockMode.BOARD_CONTAINER
      blockData.level = this.center.y
      // blockData.type = BlockType.DBG_ORANGE
    } else {
      // blockData.type = BlockType.DBG_ORANGE
    }
    return block
  }

  *iterBoardBlock() {
    const blocks = this.iterBlocksQuery(undefined, true)
    // const blocks = this.iterPatchesBlocks()
    for (const block of blocks) {
      // discard blocks not included in board shape
      // if (this.isWithinBoard(block.pos)) {
      yield block
      // }
    }
  }

  shapeBoard() {
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    const tempContainer = new BlocksPatch(this.bounds)
    const originalBounds = this.getOriginalBounds()
    const finalBounds = new Box2(asVect2(this.center), asVect2(this.center))
    const boardBlocks = this.iterBlocksQuery(undefined, false);
    // const boardBlocks = this.iterBoardBlock()
    for (const block of boardBlocks) {
      const boardBlock = this.overrideBlock(block)
      tempContainer.writeBlockData(boardBlock.index, boardBlock.data)
      // tempContainer.setBlock(boardBlock.pos, boardBlock.data, false)
      // if (this.isWithinBoard(block.pos)) {
      finalBounds.expandByPoint(asVect2(block.pos))
      // }
    }
    // copy content over final container
    const finalBoardContainer = new BlocksPatch(finalBounds)
    finalBoardContainer.rawData = tempContainer.copySubContent(finalBounds.clone().expandByScalar(1))
    // finalContainer.rawData = this.copySubContent(this.extendedBounds)
    return finalBoardContainer
  }

  smoothEdges() { }

  getBoardEntities(boardContainer: BlocksPatch, distMap: PseudoDistributionMap, entityRadius = 2) {
    const intersectsEntity = (testRange: Box2, entityPos: Vector2) => testRange.distanceToPoint(entityPos) <= entityRadius
    const spawnLocs = distMap.querySpawnLocations(
      boardContainer.bounds,
      intersectsEntity,
      () => 1,
    )
    const entities = spawnLocs
      .map(loc => {
        const startPos = asVect3(loc)
        const block = boardContainer.getBlock(startPos, false)
        return block
      })
      .filter(
        block => block && this.isWithinBoard(block.pos),
      ) as PatchBlock[]
    // TODO prune entities spawning over existing entities
    return entities
  }

  genStartPositions(boardContainer: BlocksPatch) {
    const startPositions = this.getBoardEntities(boardContainer, BoardContainer.startPosDistribution)
    WorldConf.debug.boardStartPosHighlightColor &&
      startPositions.forEach(block => {
        block.data.type = WorldConf.debug.boardStartPosHighlightColor
        block.data.mode = BlockMode.DEFAULT
        // this.swapContainer.writeBlockData(block.index, block.data)
        boardContainer.setBlock(block.pos, block.data)
      })
    return startPositions
  }

  digHoles(boardContainer: BlocksPatch) {
    const holes = this.getBoardEntities(boardContainer, BoardContainer.holesDistribution)
    WorldConf.debug.boardHolesHighlightColor &&
      holes.forEach(block => {
        block.data.type = WorldConf.debug.boardHolesHighlightColor
        block.data.level -= 1 // dig hole in the ground
        block.data.mode = BlockMode.DEFAULT
        // this.swapContainer.writeBlockData(block.index, block.data)
        boardContainer.setBlock(block.pos, block.data)
      })
    return holes
  }

  trimTrees(boardContainer: BlocksPatch) {
    const treeEntities = WorldCompute.queryEntities(boardContainer.bounds)
    const trunks = treeEntities.map(entity => {
      const entityCenter = entity.bbox.getCenter(new Vector3())
      const entityCenterBlock = boardContainer.getBlock(
        entityCenter,
        false,
      )
      entityCenter.y = entity.bbox.min.y
      return entityCenterBlock
    })
      .filter(trunkBlock => trunkBlock && this.isWithinBoard(trunkBlock.pos)) as PatchBlock[]

    trunks.forEach(trunkBlock => {
      trunkBlock.data.type = BlockType.TREE_TRUNK
      trunkBlock.data.mode = BlockMode.DEFAULT
      trunkBlock.data.level += 1
      boardContainer.setBlock(trunkBlock.pos, trunkBlock.data)
    })
    return trunks
  }

  exportRawData() {
    const { center, radius, thickness } = this
    const boardContainer = this.shapeBoard()
    const startPositions: Block[] = this.genStartPositions(boardContainer)
      .map(block => ({
        pos: block.pos,
        data: block.data
      }))
    const holes: Block[] = this.digHoles(boardContainer)
      .map(block => ({
        pos: block.pos,
        data: block.data
      }))
    const obstacles: Block[] = this.trimTrees(boardContainer)
    const containerStub = boardContainer.toStub()
    const boardData: BoardRawStub = {
      ...containerStub,
      params: {
        center,
        radius,
        maxThickness: thickness
      },
      entities: {
        startPositions,
        holes,
        obstacles,
      }
    }
    return boardData
  }

  exportData() {
    const rawStub = this.exportRawData()
    const { entities, bounds } = rawStub
    const data: BlockType[] = []
    const boardStub = {
      bounds,
      data,
      entities
    }
    return boardStub
  }

  override fromStub(boardStub: BoardRawStub) {
    super.fromStub(boardStub)
    if (boardStub.params) {
      const { center, radius, maxThickness } = boardStub.params
      this.center = center
      this.radius = radius
      this.thickness = maxThickness
    }
    this.boardBox = boardStub.bounds
    return this
  }

  isEntityOverlappingBoard = (entity: EntityData) => {
    const entityBlocks = this.iterBlocksQuery(asBox2(entity.bbox))
    for (const block of entityBlocks) {
      if (this.isWithinBoard(block.pos)) {
        return true
      }
    }
    return false
  }
}
