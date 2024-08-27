import { Box3, Vector3 } from 'three'

import { Block } from '../common/types'
import { asVect2 } from '../common/utils'
import { WorldCacheContainer } from '../index'

import { BlockData, BlockMode, PatchContainer } from './DataContainers'

export class BoardContainer extends PatchContainer {
  boardCenter
  boardRadius
  boardMaxHeightDiff

  constructor(center: Vector3, radius: number, maxHeightDiff: number) {
    super()
    this.boardRadius = radius
    this.boardCenter = center.clone().floor()
    this.boardMaxHeightDiff = maxHeightDiff
    const board_dims = new Vector3(radius, 0, radius).multiplyScalar(2)
    this.bbox.setFromCenterAndSize(this.boardCenter, board_dims)
    this.initFromBoxAndMask(this.bbox)
  }

  isInsideBoardFilter(blockPos: Vector3) {
    let isInsideBoard = false
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - this.boardCenter.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(this.boardCenter))
      isInsideBoard = dist <= this.boardRadius && heightDiff <= this.boardMaxHeightDiff
    }
    return isInsideBoard
  }

  overrideBlock(block: Block) {
    const blockData = block.data
    blockData.level = this.boardCenter.y
    blockData.mode = BlockMode.BOARD_CONTAINER
    return block
  }

  shapeBoard() {
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    // reset bbox to refine bounds
    this.bbox.min = this.boardCenter.clone()
    this.bbox.max = this.boardCenter.clone()

    for (const patch of this.availablePatches) {
      const blocks = patch.iterOverBlocks(undefined, false)
      // const blocks = this.iterPatchesBlocks()
      for (const block of blocks) {
        // discard blocs not included in board shape
        if (this.isInsideBoardFilter(block.pos)) {
          const boardBlock = this.overrideBlock(block)
          patch.writeBlockData(boardBlock.index, boardBlock.data)
          this.bbox.expandByPoint(boardBlock.pos)
          // yield boardBlock
        }
      }
    }
  }

  getBoardEntities() {
    const boardEntities = this.getAllPatchesEntities()
      .filter(ent => {
        const entityCenter = ent.bbox.getCenter(new Vector3())
        return this.isInsideBoardFilter(entityCenter)
      })
    return boardEntities
  }

  trimTrees() {
    this.availablePatches.forEach(patch => {
      patch.entitiesChunks.forEach(entity => {
        const entityCenter = entity.bbox.getCenter(new Vector3())
        const entityCenterBlock = this.getBlock(entityCenter)
        entityCenter.y = entity.bbox.min.y
        const isEntityOverlappingBoard = () => {
          const entityBlocks = patch.iterEntityBlocks(entity)
          for (const block of entityBlocks) {
            if (this.isInsideBoardFilter(block.pos)) {
              return true
            }
          }
          return false
        }

        if (entityCenterBlock && this.isInsideBoardFilter(entityCenterBlock.pos)) {
          // trim entities belonging to board
          const diff = entityCenter.clone().sub(this.boardCenter)
          entity.bbox.max.y = entity.bbox.min.y - diff.y + 2
        } else if (isEntityOverlappingBoard()) {
          // discard outside entities having an overlap with the board
          entity.bbox.makeEmpty()
        }
        // else render outside entities with no overlap as usual
      })
    })
  }

  restoreOriginalPatches() {
    const original_patches_container = new PatchContainer()
    original_patches_container.initFromBoxAndMask(this.bbox)
    original_patches_container.populateFromExisting(
      WorldCacheContainer.instance.availablePatches,
      true,
    )
    return original_patches_container
  }

  smoothEdges() {}
}
