import { Box2, Vector2, Vector3 } from 'three'

import { Block, PatchBlock } from '../common/types'
import { asBox2, asBox3, asVect2, asVect3 } from '../common/utils'
import { BlockType, GroundPatch, WorldCacheContainer, WorldCompute, WorldConf } from '../index'

import { PseudoDistributionMap } from './RandomDistributionMap'
import { BlockMode, BlocksPatch, PatchStub } from './BlocksPatch'
import { PatchesMap } from './PatchesMap'

export type BoardParams = {
  radius: number,
  maxThickness: number
}

export type BoardRawStub = PatchStub & {
  entities: {
    startPos: Block[],
    holes: Block[],
    obstacles: Block[],
  },
  params: BoardParams & { center: Vector3 }
}

const getDefaultPatchDim = () =>
  new Vector2(WorldConf.patchSize, WorldConf.patchSize)

/**
 * Entities distribution default conf
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

const computeBoardBox = (center: Vector3, radius: number) =>
  new Box2().setFromCenterAndSize(asVect2(center), new Vector2(radius, radius).multiplyScalar(2))

export class BoardContainer extends GroundPatch {
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
  // board overriden block
  boardBox: Box2
  swapBuffer!: Uint32Array

  constructor(boardCenter = new Vector3(), boardRadius = 0, boardThickness = 0) {
    super(computeBoardBox(boardCenter, boardRadius), 0)
    this.radius = boardRadius
    this.center = boardCenter.clone().floor()
    this.boardBox = new Box2(asVect2(this.center), asVect2(this.center))
    this.thickness = boardThickness
    // this.initBoard()
  }

  // initBoard(boardCenter:Vector3, boardRadius:number, boardThickness:number){

  // }

  /**
   * switch between original and overriden buffer
   */
  swapBuffers() {
    const bufferSave = this.rawData
    this.rawData = this.swapBuffer
    this.swapBuffer = bufferSave
  }

  buildBoard(): void {
    this.shapeBoard()
    // this.debug()
    // console.log(this.dataExport())
    // this.showStartPositions()
    // this.digHoles()
    // this.trimTrees()
  }

  restoreOriginalPatches() {
    const original_patches_container = new PatchesMap(getDefaultPatchDim())
    original_patches_container.init(this.bounds)
    original_patches_container.populateFromExisting(
      WorldCacheContainer.instance.availablePatches,
      true,
    )
    return original_patches_container
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

  // overrideBlock(block: PatchBlock) {
  //   const blockData = block.data
  //   blockData.level = this.center.y
  //   blockData.mode = BlockMode.BOARD_CONTAINER
  //   return block
  // }

  overrideBlock(block: PatchBlock) {
    const blockData = block.data
    // blockData.level = this.center.y
    if (this.isWithinBoard(block.pos)) {
      blockData.mode = BlockMode.BOARD_CONTAINER
      blockData.level = this.center.y
      blockData.type = BlockType.DBG_ORANGE
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
    // reset bbox to refine bounds
    const tempContainer = new BlocksPatch(this.bounds, 0)
    tempContainer.rawData.fill(0)
    // const boardBlocks = this.iterBlocksQuery(undefined, true);
    const boardBlocks = this.iterBoardBlock()
    for (const block of boardBlocks) {
        const boardBlock = this.overrideBlock(block)
        tempContainer.writeBlockData(boardBlock.index, boardBlock.data)
        // tempContainer.setBlock(boardBlock.pos, boardBlock.data, false)
      // if (this.isWithinBoard(block.pos)) {
        this.boardBox.expandByPoint(asVect2(block.pos))
      // }
    }
    // copy content over 
    this.swapBuffer = tempContainer.copySubContent(this.boardBox)
  }

  getBoardEntities(distMap: PseudoDistributionMap, entityRadius = 2) {
    const intersectsEntity = (testRange: Box2, entityPos: Vector2) => testRange.distanceToPoint(entityPos) <= entityRadius
    const spawnLocs = distMap.querySpawnLocations(
      this.bounds,
      intersectsEntity,
      () => 1,
    )
    const entities = spawnLocs
      .map(loc => {
        const startPos = asVect3(loc)
        const block = this.getBlock(startPos, false)
        return block
      })
      .filter(
        ent => ent && this.isWithinBoard(ent.pos),
      ) as PatchBlock[]
    // TODO prune entities spawning over existing entities
    return entities
  }

  smoothEdges() { }

  showStartPositions() {
    const startPositions = this.getBoardEntities(BoardContainer.startPosDistribution)
    WorldConf.debug.boardStartPosHighlightColor &&
      startPositions.forEach(block => {
        const patch = this.findPatch(block.pos)
        if (patch && block) {
          block.data.type = WorldConf.debug.boardStartPosHighlightColor
          block.data.mode = BlockMode.DEFAULT
          patch.writeBlockData(block.index, block.data)
          // patch.setBlock(block.pos, block.data)
        }
      })
    return startPositions
  }

  digHoles() {
    const holes = this.getBoardEntities(BoardContainer.holesDistribution)
    WorldConf.debug.boardHolesHighlightColor &&
      holes.forEach(block => {
        const patch = this.findPatch(block.pos)
        if (patch && block) {
          block.data.type = WorldConf.debug.boardHolesHighlightColor
          block.data.level -= 1 // dig hole in the ground
          block.data.mode = BlockMode.DEFAULT
          patch.writeBlockData(block.index, block.data)
          // patch.setBlock(block.pos, block.data)
        }
      })
  }

  trimTrees() {
    const treeEntities = WorldCompute.queryEntities(this.bounds)
    treeEntities.forEach(entity => {
      const entityCenter = entity.bbox.getCenter(new Vector3())
      const entityCenterBlock = this.getBlock(
        entityCenter,
        false,
      )
      entityCenter.y = entity.bbox.min.y
      const isEntityOverlappingBoard = () => {
        const entityBlocks = this.iterBlocksQuery(asBox2(entity.bbox))
        for (const block of entityBlocks) {
          if (this.isWithinBoard(block.pos)) {
            return true
          }
        }
        return false
      }

      if (entityCenterBlock && this.isWithinBoard(entityCenterBlock.pos)) {
        // trim entities belonging to board
        const diff = entityCenter.clone().sub(this.center)
        // const radius = 3
        // const entityCenterPos = entityCenterBlock.pos
        // entity.bbox.min.x = entityCenterPos.x - radius
        // entity.bbox.max.x = entityCenterPos.x + radius
        // entity.bbox.min.z = entityCenterPos.z - radius
        // entity.bbox.max.z = entityCenterPos.z + radius
        entity.bbox.max.y = entity.bbox.min.y + 2 - Math.min(diff.y, 0)
        // const entityBlocks = patch.iterEntityBlocks(entity)
        // // check if a block is outside the board and belongs to another patch
        // for (const block of entityBlocks) {
        //   if (!this.isInsideBoard(block) && !this.findPatch(block.pos)?.bbox.equals(patch.bbox)) {
        //     // discard entity
        //     entity.bbox.makeEmpty()
        //   }
        // }
      } else if (isEntityOverlappingBoard()) {
        // discard outside entities having an overlap with the board
        entity.bbox.makeEmpty()
      }
      // else render outside entities with no overlap as usual
    })
  }

  dataExport() {

  }

  rawDataExport() {
    const { startPosDistribution, holesDistribution } = BoardContainer
    const { center, radius, thickness } = this
    const startPos: Block[] = []
    // this.getBoardEntities(startPosDistribution)
    //   .map(block => ({
    //     pos: block.pos,
    //     data: block.data
    //   }))
    const holes: Block[] = []
    // this.getBoardEntities(holesDistribution)
    //   .map(block => ({
    //     pos: block.pos,
    //     data: block.data
    //   }))
    const obstacles: Block[] = []
    const boardData: BoardRawStub = {
      bounds: this.boardBox,
      params: {
        center,
        radius,
        maxThickness: thickness
      },
      rawData: this.swapBuffer,
      entities: {
        startPos,
        holes,
        obstacles,
      }
    }
    return boardData
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
}
