import { Box3, Vector3, Vector2 } from 'three'

import { EntityData } from '../common/types'
import { asVect2 } from '../common/utils'
import { BlockType, WorldUtils } from '../index'
import { TreeGenerators } from '../tools/TreeGenerator'

import { WorldChunk } from './WorldChunk'

export type EntityChunkStub = {
  box: Box3
  data: Uint16Array
  entity?: EntityData
}

const adjustChunkBox = (entityBox: Box3, chunkBox?: Box3) => {
  if (chunkBox instanceof Vector3) {
    const blockStart = new Vector3(chunkBox.x, entityBox.min.y, chunkBox.z)
    const blockEnd = blockStart
      .clone()
      .add(new Vector3(1, entityBox.max.y - entityBox.min.y, 1))
    chunkBox = new Box3(blockStart, blockEnd)
  }

  return chunkBox || entityBox
}

export class EntityChunk extends WorldChunk {
  entityData: EntityData

  constructor(entityData: EntityData, customChunkBox?: Box3) {
    super(adjustChunkBox(entityData.bbox, customChunkBox))
    this.entityData = entityData
  }

  voxelize() {
    const { bbox, params, type } = this.entityData
    const { size: treeSize, radius: treeRadius } = params
    const entityPos = bbox.getCenter(new Vector3())
    const { min, max } = this.chunkBox
    let index = 0
    for (let { z } = min; z < max.z; z++) {
      for (let { x } = min; x < max.x; x++) {
        for (let { y } = min; y < max.y; y++) {
          const xzProj = new Vector2(x, z).sub(asVect2(entityPos))
          if (xzProj.length() > 0) {
            if (y < min.y + treeSize) {
              // empty space around trunk between ground and trunk top
              this.chunkData[index++] = BlockType.NONE
            } else {
              // tree foliage
              const blockType = TreeGenerators[type](
                xzProj.length(),
                y - (min.y + treeSize + treeRadius),
                treeRadius,
              )
              this.chunkData[index++] = blockType
            }
          } else {
            // tree trunk
            this.chunkData[index++] = BlockType.TREE_TRUNK
          }
        }
      }
    }
    return this.chunkData
  }

  getBlocksBuffer(blockPos: Vector3) {
    const { chunkBox, chunkData } = this
    const chunkDims = chunkBox.getSize(new Vector3())
    const chunkLocalPos = blockPos.clone().sub(chunkBox.min)
    const buffIndex =
      chunkLocalPos.z * chunkDims.x * chunkDims.y +
      chunkLocalPos.x * chunkDims.y
    const buffer = chunkData.slice(buffIndex, buffIndex + chunkDims.y)
    return buffer
  }

  toStub() {
    const { chunkBox, chunkData, entityData } = this
    const entityChunk: EntityChunkStub = {
      box: chunkBox,
      data: chunkData,
      entity: entityData,
    }
    return entityChunk
  }

  static fromStub(chunkStub: EntityChunkStub) {
    const entityChunkData = chunkStub.data
    const entityChunkBox = WorldUtils.parseThreeStub(chunkStub.box)
    const entityData = chunkStub.entity as EntityData
    entityData.bbox = WorldUtils.parseThreeStub(entityData.bbox)
    const entityChunk = new EntityChunk(entityData, entityChunkBox)
    entityChunk.chunkData = entityChunkData
    return entityChunk
  }
}
