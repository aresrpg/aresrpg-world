import { Vector3 } from "three";
import { asBox2 } from "../common/utils";
import { BlockType, WorldCompute, WorldConf } from "../index";
import { BlocksPatch } from "../datacontainers/BlocksPatch";
import { EntityChunk } from "../datacontainers/EntityChunk";
import { WorldChunk } from "../datacontainers/WorldChunk";

// for debug use only
const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
    return WorldConf.debug.patchBordersHighlightColor && (localPos.x === 1 || localPos.z === 1)
        ? WorldConf.debug.patchBordersHighlightColor
        : blockType
}

export class GroundPatch extends BlocksPatch {
    fill() {
        const { min, max } = this.bounds
        const blocks = this.iterBlocksQuery(undefined, false)
        const level = {
            min: 512,
            max: 0
        }
        let blockIndex = 0
        for (const block of blocks) {
            const blockData = WorldCompute.computeGroundBlock(block.pos)
            level.min = Math.min(min.y, blockData.level)
            level.max = Math.max(max.y, blockData.level)
            this.writeBlockData(blockIndex, blockData)
            blockIndex++
        }
        // this.bounds.min = min
        // this.bounds.max = max
        // this.bounds.getSize(this.dimensions)
    }

    fillChunk(worldChunk: WorldChunk) {
        const blocks = this.iterBlocksQuery(undefined, false)
        for (const block of blocks) {
            const blockData = block.data
            const blockType = block.data.type
            const blockLocalPos = block.localPos as Vector3
            blockLocalPos.x += 1
            // block.localPos.y = patch.bbox.max.y
            blockLocalPos.z += 1
            blockData.type =
                highlightPatchBorders(blockLocalPos, blockType) || blockType
            worldChunk.writeBlock(blockLocalPos, blockData, block.buffer || [])
        }
    }

    // TODO rename mergeWithEntities
    mergeEntityVoxels(entityChunk: EntityChunk, worldChunk: WorldChunk) {
        // return overlapping blocks between entity and container
        const patchBlocksIter = this.iterBlocksQuery(asBox2(entityChunk.chunkBox))
        // iter over entity blocks
        for (const block of patchBlocksIter) {
            // const buffer = entityChunk.data.slice(chunkBufferIndex, chunkBufferIndex + entityDims.y)
            let bufferData = entityChunk.getBlocksBuffer(block.pos)
            const buffOffset = entityChunk.chunkBox.min.y - block.pos.y
            const buffSrc = Math.abs(Math.min(0, buffOffset))
            const buffDest = Math.max(buffOffset, 0)
            bufferData = bufferData.copyWithin(buffDest, buffSrc)
            bufferData =
                buffOffset < 0
                    ? bufferData.fill(BlockType.NONE, buffOffset)
                    : bufferData
            block.localPos.x += 1
            block.localPos.z += 1
            worldChunk.writeBlock(
                block.localPos,
                block.data,
                bufferData,
            )
        }
    }
}