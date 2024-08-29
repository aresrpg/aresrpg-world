import { Box2, Box3, Vector2, Vector3 } from 'three'

import { EntityData, PatchBlock } from '../common/types'
import { asVect2, asVect3 } from '../common/utils'
import { BlockType, WorldCacheContainer, WorldConfig } from '../index'
import { PseudoDistributionMap } from '../procgen/RandomDistributionMap'
import { BlockData, BlockMode, BlocksPatchContainer } from './BlocksPatch'
import { PatchesMap } from './DataContainers'

export type BoardStub = {
  bbox: Box3,
  data: BlockData
}

const getDefaultPatchDim = () => new Vector2(WorldConfig.patchSize, WorldConfig.patchSize)

const distParams = {
  minDistance: 5,
  maxDistance: 16,
  tries: 20,
}
const distMap = new PseudoDistributionMap(undefined, distParams)
distMap.populate()

export class BoardContainer extends PatchesMap<BlocksPatchContainer> {
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
    this.initFromBoxAndMask(this.bbox)
  }

  restoreOriginalPatches() {
    const original_patches_container = new PatchesMap(getDefaultPatchDim())
    original_patches_container.initFromBoxAndMask(this.bbox)
    original_patches_container.populateFromExisting(
      WorldCacheContainer.instance.availablePatches,
      true,
    )
    return original_patches_container
  }

  filterBoardBlocks(blockPos: Vector3) {
    let isInsideBoard = false
    if (blockPos) {
      const heightDiff = Math.abs(blockPos.y - this.boardCenter.y)
      const dist = asVect2(blockPos).distanceTo(asVect2(this.boardCenter))
      isInsideBoard = dist <= this.boardRadius && heightDiff <= this.boardMaxHeightDiff
    }
    return isInsideBoard
  }

  overrideBlock(block: PatchBlock) {
    const blockData = block.data
    blockData.level = this.boardCenter.y
    blockData.mode = BlockMode.BOARD_CONTAINER
    return block
  }

  shapeBoard() {
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    // reset bbox to refine bounds
    this.bbox.min = asVect2(this.boardCenter)
    this.bbox.max = asVect2(this.boardCenter)

    for (const patch of this.availablePatches) {
      const blocks = patch.iterOverBlocks(undefined, false)
      // const blocks = this.iterPatchesBlocks()
      for (const block of blocks) {
        // discard blocs not included in board shape
        if (this.filterBoardBlocks(block.pos)) {
          const boardBlock = this.overrideBlock(block)
          patch.writeBlockData(boardBlock.index, boardBlock.data)
          this.bbox.expandByPoint(asVect2(boardBlock.pos))
          // yield boardBlock
        }
      }
    }
  }

  getAllPatchesEntities(skipDuplicate = true) {
    const entities: EntityData[] = []
    for (const patch of this.availablePatches) {
      patch.entities.forEach(entity => {
        if (!skipDuplicate || !entities.find(ent => ent.bbox.equals(entity.bbox))) {
          entities.push(entity)
        }
      })
    }
    return entities
  }

  getBoardEntities() {
    const boardEntities = this.getAllPatchesEntities()
      .filter(ent => {
        const entityCenter = ent.bbox.getCenter(new Vector3())
        return this.filterBoardBlocks(entityCenter)
      })
    return boardEntities
  }

  trimTrees() {
    this.availablePatches.forEach(patch => {
      patch.entities.forEach(entity => {
        const entityCenter = entity.bbox.getCenter(new Vector3())
        const entityCenterBlock = this.findPatch(entityCenter)?.getBlock(entityCenter, false)
        entityCenter.y = entity.bbox.min.y
        const isEntityOverlappingBoard = () => {
          const entityBlocks = patch.iterOverBlocks(entity.bbox)
          for (const block of entityBlocks) {
            if (this.filterBoardBlocks(block.pos)) {
              return true
            }
          }
          return false
        }

        if (entityCenterBlock && this.filterBoardBlocks(entityCenterBlock.pos)) {
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

  genStartPosEntities() {
    const existingBoardEntities = this.getBoardEntities()
    const entityShape = (pos: Vector2) => new Box2(pos, pos.clone().addScalar(2))
    this.patchRange.clone().expandByScalar(WorldConfig.patchSize)
    const items = distMap.iterMapItems(entityShape, this.bbox, () => 1)
    for (const mapPos of items) {
      const pos = asVect3(mapPos)
      const patch = this.findPatch(pos)
      const block = patch?.getBlock(pos, false)
      if (patch && block) {
        block.data.type = BlockType.MUD
        patch.writeBlockData(block.index, block.data)
        // patch.setBlock(block.pos, block.data)
      }
    }
    // discard entities from spawning over existing entities
    const discardEntity = (entity: EntityData) => existingBoardEntities
      .find(boardEntity => entity.bbox.intersectsBox(boardEntity.bbox))
    // RepeatableEntitiesMap.instance.
  }

  genHoleEntities() {

  }

  highlightStartPos() {

  }

  digHoles() {

  }

  exportStub() {
    const origin = this.bbox.min.clone()
    const dimensions = this.bbox.getSize(new Vector3())
    const { x, z } = dimensions
    const size = { x, z }
    // const data = 
    // const boardData = {
    //   origin,
    //   size,
    //   data
    // }
  }

  smoothEdges() { }
}
