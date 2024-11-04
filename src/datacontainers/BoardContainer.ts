import { Box2, Vector2 } from 'three'

import { asVect2, asVect3 } from '../utils/common'
import {
  ProcLayer,
  WorldContainer,
  BoardPatch,
  WorldPatch,
} from '../index'
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

export type BoardParams = {
  center: Vector2
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

export class BoardContainer extends WorldContainer<BoardPatch> {
  // board input
  boardParams: BoardParams = {
    center: new Vector2,
    radius: 0,
    thickness: 0
  }
  // board output
  boardContent: BoardContent = {
    bounds: new Box2,
    elevation: 0,
    data: []
  }
  static boardHolesLayer = new ProcLayer('holesMap')
  override patchConstructor = (key: string) => new BoardPatch(key, this) as WorldPatch;

  constructor(boardRadius: number, boardThickness: number) {
    super()
    this.boardParams.radius = boardRadius
    this.boardParams.thickness = boardThickness
    BoardContainer.boardHolesLayer.sampling.periodicity = 0.25
    // this.center = boardCenter
  }

  get boardBounds() {
    return this.boardContent.bounds
  }

  set boardBounds(val: Box2) {
    this.boardContent.bounds = val
  }

  get boardElevation() {
    return this.boardContent.elevation
  }

  set boardElevation(val: number) {
    this.boardContent.elevation = val
  }

  async setupBoard(center: Vector2) {
    const { radius } = this.boardParams
    // clear previous patches to start from fresh data
    this.patchLookup = {}
    const patchLookup = super.rebuildIndexAroundPosAndRad(center, radius)
    this.boardParams.center = center
    this.patchLookup = patchLookup || this.patchLookup
    return patchLookup
  }

  adjustBoardBounds() {
    const boardCenter = this.boardParams.center
    const boardBounds = new Box2(boardCenter.clone(), boardCenter.clone())
    for (const patch of this.patches) {
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

  async genBoardContent() {
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
    const finalBoardContainer = new BoardPatch(boardBounds, this)
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
    const boardContent: BoardContent = { bounds: boardBounds, elevation: boardElevation, data }
    return boardContent
  }
}

