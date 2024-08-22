import { Vector3 } from 'three'

import { asVect2 } from '../common/utils'
import { BlockType } from '../index'

import { BlockData, BlockMode, PatchContainer } from './DataContainers'

export class BoardContainer extends PatchContainer {
  boardCenter
  boardRadius

  constructor(center: Vector3, radius: number) {
    super()
    this.boardRadius = radius
    this.boardCenter = center.clone().floor()
    const board_dims = new Vector3(radius, 0, radius).multiplyScalar(2)
    this.bbox.setFromCenterAndSize(this.boardCenter, board_dims)
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
        const dist = asVect2(block.pos).distanceTo(asVect2(boardCenter))
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
    const maxHeightDiff = 5
    const { boardCenter, boardRadius } = this
    // const { ymin, ymax } = this.getMinMax()
    // const avg = Math.round(ymin + (ymax - ymin) / 2)
    this.availablePatches.forEach(patch => {
      const blocks = patch.iterOverBlocks(this.bbox)
      for (const block of blocks) {
        // discard blocs not included in board shape
        const dist = asVect2(block.pos).distanceTo(asVect2(boardCenter))
        const blockData = block.data
        blockData.level = boardCenter.y
        blockData.mode = BlockMode.BOARD_CONTAINER
        const heightDiff = Math.abs(block.pos.y - boardCenter.y)
        if (dist <= boardRadius && heightDiff <= maxHeightDiff && block.index !== undefined) {
          patch.writeBlockData(block.index, blockData)
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

  smoothEdges() { }
}
