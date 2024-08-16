import { Vector3 } from 'three'

import { asVect2 } from '../common/utils'
import { BlockType } from '../index'

import { PatchContainer } from './DataContainers'

export class BoardContainer extends PatchContainer {
  boardCenter
  boardRadius

  constructor(center: Vector3, radius: number) {
    super()
    this.boardRadius = radius
    this.boardCenter = asVect2(center).floor()
    const board_dims = new Vector3(radius, 0, radius).multiplyScalar(2)
    this.bbox.setFromCenterAndSize(center.clone().floor(), board_dims)
    this.initFromBoxAndMask(this.bbox)
  }

  getMinMax() {
    const { boardCenter, boardRadius } = this
    let ymin = this.bbox.max.y
    let ymax = this.bbox.min.y
    this.availablePatches.forEach(patch => {
      const blocks = patch.iterOverBlocks(this.bbox)
      for (const block of blocks) {
        // discard blocs not included in board shape
        const dist = asVect2(block.pos).distanceTo(boardCenter)
        if (dist <= boardRadius) {
          const block_level = block.pos.y
          ymin = Math.min(block_level, ymin)
          ymax = Math.max(block_level, ymax)
        }
      }
    })
    return { ymin, ymax }
  }

  shapeBoard() {
    const { boardCenter, boardRadius } = this
    const { ymin, ymax } = this.getMinMax()
    const avg = Math.round(ymin + (ymax - ymin) / 2)
    this.availablePatches.forEach(patch => {
      const blocks = patch.iterOverBlocks(this.bbox)
      for (const block of blocks) {
        // discard blocs not included in board shape
        const dist = asVect2(block.pos).distanceTo(boardCenter)
        const y_diff = Math.abs(block.pos.y - avg)
        if (dist <= boardRadius && y_diff <= 5 && block.index !== undefined) {
          patch.writeBlockAtIndex(block.index, block.pos.y, BlockType.MUD)
        }
      }
    })
  }

  // mergeBoardBlocks(blocksContainer: BlocksContainer) {
  //     // for each patch override with blocks from blocks container
  //     this.availablePatches.forEach(patch => {
  //         const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
  //         for (const target_block of blocksIter) {
  //             const source_block = blocksContainer.getBlock(target_block.pos, false)
  //             if (source_block && source_block.pos.y > 0 && target_block.index) {
  //                 let block_type = source_block.type ? BlockType.MUD : BlockType.NONE
  //                 block_type = source_block.type === BlockType.TREE_TRUNK ? BlockType.TREE_TRUNK : block_type
  //                 const block_level = blocksContainer.bbox.min.y//source_block?.pos.y
  //                 patch.writeBlockAtIndex(target_block.index, block_level, block_type)
  //                 // console.log(source_block?.pos.y)
  //             }
  //         }
  //     })
  // }

  smoothEdges() {}
}
