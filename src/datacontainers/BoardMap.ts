import { Box2, Vector2, Vector3 } from 'three'

import { Block, PatchBlock } from '../common/types'
import { asVect2, asVect3 } from '../common/utils'
import { WorldCacheContainer, WorldConf } from '../index'

import { PseudoDistributionMap } from './RandomDistributionMap'
import { BlockMode, BlocksPatch } from './BlocksPatch'
import { PatchesMap } from './PatchesMap'

export type BoardData = {
  box: Box2,
  blocks: [],
  entities: {
    startPos: Block[],
    holes: Block[],
    obstacles: Block[],
  }
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

export class BoardContainer extends PatchesMap<BlocksPatch> {
  // static singleton: BoardContainer
  // static get instance(){
  //   return this.singleton
  // }
  static holesDistribution = new PseudoDistributionMap(undefined, holesDistParams)
  static startPosDistribution = new PseudoDistributionMap(undefined, startPosDistParams) 

  // board instance params
  boardCenter
  boardRadius
  boardMaxHeightDiff

  constructor(center: Vector3, radius: number, maxHeightDiff: number) {
    super(getDefaultPatchDim())
    this.boardRadius = radius
    this.boardCenter = center.clone().floor()
    this.boardMaxHeightDiff = maxHeightDiff
    const board_dims = new Vector2(radius, radius).multiplyScalar(2)
    this.bbox.setFromCenterAndSize(asVect2(this.boardCenter), board_dims)
    this.init(this.bbox)
  }

  initBoard(): void {
    this.shapeBoard()
    console.log(this.dataExport())
    this.showStartPositions()
    this.digHoles()
    this.trimTrees()
  }

  restoreOriginalPatches() {
    const original_patches_container = new PatchesMap(getDefaultPatchDim())
    original_patches_container.init(this.bbox)
    original_patches_container.populateFromExisting(
      WorldCacheContainer.instance.availablePatches,
      true,
    )
    return original_patches_container
  }

  isWithinBoard(blockPos: Vector3) {
    let isInsideBoard = false
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - this.boardCenter.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(this.boardCenter))
      isInsideBoard =
        dist <= this.boardRadius && heightDiff <= this.boardMaxHeightDiff
    }
    return isInsideBoard
  }

  overrideBlock(block: PatchBlock) {
    const blockData = block.data
    blockData.level = this.boardCenter.y
    blockData.mode = BlockMode.BOARD_CONTAINER
    return block
  }

  getBoardEntities(distMap: PseudoDistributionMap, entityRadius = 2) {
    const intersectsEntity = (testRange: Box2, entityPos: Vector2) => testRange.distanceToPoint(entityPos) <= entityRadius
    const spawnLocs = distMap.querySpawnLocations(
      this.bbox,
      intersectsEntity,
      () => 1,
    )
    const entities = spawnLocs
      .map(loc => {
        const startPos = asVect3(loc)
        const patch = this.findPatch(startPos)
        const block = patch?.getBlock(startPos, false)
        return block
      })
      .filter(
        ent => ent && this.isWithinBoard(ent.pos),
      ) as PatchBlock[]
    // TODO prune entities spawning over existing entities
    return entities
  }

  shapeBoard() {
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    // reset bbox to refine bounds
    this.bbox.min = asVect2(this.boardCenter)
    this.bbox.max = asVect2(this.boardCenter)

    for (const patch of this.availablePatches) {
      const blocks = patch.iterBlocksQuery(undefined, false)
      // const blocks = this.iterPatchesBlocks()
      for (const block of blocks) {
        // discard blocs not included in board shape
        if (this.isWithinBoard(block.pos)) {
          const boardBlock = this.overrideBlock(block)
          patch.writeBlockData(boardBlock.index, boardBlock.data)
          this.bbox.expandByPoint(asVect2(boardBlock.pos))
          // yield boardBlock
        }
      }
    }
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
    this.availablePatches.forEach(patch => {
      patch.entities.forEach(entity => {
        const entityCenter = entity.bbox.getCenter(new Vector3())
        const entityCenterBlock = this.findPatch(entityCenter)?.getBlock(
          entityCenter,
          false,
        )
        entityCenter.y = entity.bbox.min.y
        const isEntityOverlappingBoard = () => {
          const entityBlocks = patch.iterBlocksQuery(entity.bbox)
          for (const block of entityBlocks) {
            if (this.isWithinBoard(block.pos)) {
              return true
            }
          }
          return false
        }

        if (entityCenterBlock && this.isWithinBoard(entityCenterBlock.pos)) {
          // trim entities belonging to board
          const diff = entityCenter.clone().sub(this.boardCenter)
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
    })
  }

  dataExport() {
    const {startPosDistribution, holesDistribution} = BoardContainer
    const startPos = this.getBoardEntities(startPosDistribution)
      .map(block => ({
        pos: block.pos,
        data: block.data
      }))
    const holes = this.getBoardEntities(holesDistribution)
      .map(block => ({
        pos: block.pos,
        data: block.data
      }))
    // TODO refactor: consider trees as no longer attached to ground patch 
    // but retrievable like any other entities 
    const obstacles: Block[] = []
    const boardData: BoardData = {
      box: this.bbox,
      blocks: [],
      entities: {
        startPos,
        holes,
        obstacles,
      }
    }
    return boardData
  }
}
