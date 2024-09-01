import { Box3, Vector3, Vector2 } from "three"
import { EntityData } from "../common/types"
import { asVect2 } from "../common/utils"
import { BlockType } from "../index"
import { TreeGenerators } from "../tools/TreeGenerator"

export type EntityChunk = {
    box: Box3,
    data: Uint16Array,
    entity?: EntityData
}

export class EntityChunkMaker {
    entityData: EntityData
    chunkBox: Box3 = new Box3().setFromPoints([new Vector3()])
    chunkData: Uint16Array | undefined

    constructor(entityData: EntityData) {
        this.entityData = entityData
    }

    voxelizeEntity(chunkBox?: Vector3 | Box3) {
        const { bbox, params, type } = this.entityData
        if (chunkBox instanceof Vector3) {
            const blockStart = new Vector3(
                chunkBox.x,
                bbox.min.y,
                chunkBox.z,
            )
            const blockEnd = blockStart
                .clone()
                .add(new Vector3(1, bbox.max.y - bbox.min.y, 1))
            chunkBox = new Box3(blockStart, blockEnd)
        }
        this.chunkBox = chunkBox || bbox
        const dims = this.chunkBox.getSize(new Vector3())
        this.chunkData = new Uint16Array(dims.z * dims.x * dims.y)
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

    toStub() {
        const { chunkBox, chunkData, entityData } = this
        if (chunkData) {
            const entityChunk: EntityChunk = {
                box: chunkBox,
                data: chunkData,
                entity: entityData
            }
            return entityChunk
        }
        return
    }
}