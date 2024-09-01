import { computeGroundBlock } from "../api/world-compute";
import { BlocksPatch } from "./BlocksPatch";

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
            const blockData = computeGroundBlock(block.pos)
            level.min = Math.min(min.y, blockData.level)
            level.max = Math.max(max.y, blockData.level)
            this.writeBlockData(blockIndex, blockData)
            blockIndex++
        }
        // this.bounds.min = min
        // this.bounds.max = max
        // this.bounds.getSize(this.dimensions)
    }
}