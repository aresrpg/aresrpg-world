import { BlockType } from "../procgen/Biome";
import { BlocksContainer, PatchContainer } from "./Patches";

export class BoardContainer extends PatchContainer {

    mergeBoardBlocks(blocksContainer: BlocksContainer) {
        // for each patch override with blocks from blocks container
        this.availablePatches.forEach(patch => {
            const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
            for (const target_block of blocksIter) {
                const source_block = blocksContainer.getBlock(target_block.pos, false)
                if (source_block && source_block.pos.y > 0 && target_block.index) {
                    let block_type = source_block.type ? BlockType.MUD : BlockType.NONE
                    block_type = source_block.type === BlockType.TREE_TRUNK ? BlockType.TREE_TRUNK : block_type
                    const block_level = blocksContainer.bbox.min.y//source_block?.pos.y
                    patch.writeBlockAtIndex(target_block.index, block_level, block_type)
                    // console.log(source_block?.pos.y)
                }
            }
        })
    }

    interpolateBoardEdges(){
        
    }
}