import { Box3, Vector3 } from 'three'
import { Block } from '../common/types'

import { asVect2 } from '../common/utils'
import { WorldCacheContainer } from '../index'

import { BlockMode, PatchContainer } from './DataContainers'

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

  isInsideBoard(block: Block) {
    // const block = input instanceof Vector3 ? this.getBlock(input) : input
    let res = false
    if (block) {
      const heightDiff = Math.abs(block.pos.y - this.boardCenter.y)
      const dist = asVect2(block.pos).distanceTo(asVect2(this.boardCenter))
      res = dist <= this.boardRadius && heightDiff <= this.boardMaxHeightDiff
    }
    return res
  }

  shapeBoard() {
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    this.availablePatches.forEach(patch => {
      const blocks = patch.iterOverBlocks(this.bbox)
      for (const block of blocks) {
        // discard blocs not included in board shape
        if (this.isInsideBoard(block) && block.index !== undefined) {
          const blockData = block.data
          blockData.level = this.boardCenter.y
          blockData.mode = BlockMode.BOARD_CONTAINER
          patch.writeBlockData(block.index, blockData)
        }
      }
    })
  }

  trimEntities() {
    this.availablePatches.forEach(patch => {
      patch.entitiesChunks.forEach(entity => {
        const entityMin = patch.toGlobalPos(entity.bbox.min)
        const entityMax = patch.toGlobalPos(entity.bbox.max)
        const entityBox = new Box3(entityMin, entityMax)
        const entityCenter = entityBox.getCenter(new Vector3())
        // console.log(entityCenter)
        const entityCenterBlock = this.getBlock(entityCenter)
        entityCenter.y = entityMin.y
        const isEntityOverlappingBoard = () => {
          const entityBlocks = patch.iterEntityBlocks(entity)
          for (const block of entityBlocks) {
            if (this.isInsideBoard(block)) {
              return true
            }
          }
          return false
        }

        if (entityCenterBlock && this.isInsideBoard(entityCenterBlock)) {
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

  smoothEdges() {

  }

}
