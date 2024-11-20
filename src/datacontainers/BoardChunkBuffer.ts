import { Vector3, Box2, Vector2, Box3 } from "three";
import { BlockData, BlockMode } from "../utils/types";
import { asBox2, asVect2, asVect3 } from "../utils/common";
import { BoardContainer } from "./BoardContainer";
import { ItemsInventory } from "../misc/ItemsInventory";
import { BlockType } from "../procgen/Biome";
import { ChunkContainer } from "./ChunkContainer";

/**
 * Board patch generation by overriding ground patch output on-the-fly
 */
export class BoardChunkBuffer extends ChunkContainer {
    parentContainer: BoardContainer
    boardBounds: Box2 | undefined
    boardItems: Vector2[] = []

    constructor(boundsOrChunkKey: string | Box3, parentContainer: BoardContainer) {
        super(boundsOrChunkKey);
        this.parentContainer = parentContainer
        // this.boardBounds = new Box2()
    }

    isWithinBoard(blockPos: Vector3) {
        const { thickness, radius, center } = this.parentContainer.boardParams
        const { boardElevation } = this.parentContainer;
        if (blockPos) {
            const heightDiff = Math.abs(blockPos.y - boardElevation)
            const dist = asVect2(blockPos).distanceTo(center)
            // pos inside board
            const isInside = dist <= radius && heightDiff <= thickness
            // if (isInside) {
            //     this.boardBounds = this.boardBounds || new Box2(asVect2(blockPos), asVect2(blockPos))
            //     this.boardBounds.expandByPoint(asVect2(blockPos))
            //     return true
            // }
            return isInside
        }

        // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
        return false
    }

    isOverlappingBoard = (bounds: Box2) => {
        const patchBlocks = this.iterBlocksQuery(bounds)
        for (const block of patchBlocks) {
            if (this.isWithinBoard(block.pos)) {
                return true
            }
        }
        return false
    }

    isGroundHole(testPos: Vector2) {
        return BoardContainer.boardHolesLayer.eval(testPos) < 0.15
    }

    /**
     * Overrides patch ground data with board data 
     * @param iterBounds 
     * @param skipMargin 
     */
    override readBlockData(blockIndex: number): BlockData {
        const { boardElevation } = this.parentContainer
        const blockData = super.readBlockData(blockIndex)
        const blockLocPos = this.getLocalPosFromIndex(blockIndex)
        const blockPos = this.toWorldPos(blockLocPos)
        if (this.isWithinBoard(asVect3(blockPos, blockData.level))) {
            const isGroundHole = this.isGroundHole(blockPos)
            blockData.mode = isGroundHole ? BlockMode.DEFAULT : BlockMode.BOARD_CONTAINER
            blockData.type = isGroundHole ? BlockType.HOLE : blockData.type
            blockData.level = isGroundHole ? boardElevation - 1 : boardElevation
            // block.pos.y = boardLevel
        }
        return blockData
    }

    override async *itemsChunksOtfGen() {
        await this.retrieveOvergroundItems()
        const boardItems = []
        // prune items within or overlapping with board 
        for await (const [item_type, spawn_places] of Object.entries(this.overgroundItems)) {
            const items_backup = spawn_places.splice(0)
            for await (const spawnOrigin of items_backup) {
                // separate items spawning inside board for later processing
                if (this.isWithinBoard(spawnOrigin)) {
                    boardItems.push(asVect2(spawnOrigin))
                    // const chunk = new ChunkContainer()
                }
                // from items outside board
                else {
                    const itemChunk = await ItemsInventory.getInstancedChunk(
                        item_type,
                        spawnOrigin,
                    )
                    // discard entities overlapping with the board
                    if (itemChunk && !this.isOverlappingBoard(asBox2(itemChunk?.bounds))) {
                        spawn_places.push(spawnOrigin)
                        // externalItemsChunks.push(itemChunk)
                        yield itemChunk
                    }
                }
            }
        }
        this.boardItems = boardItems
    }

    /**
     * Add trimmed items above board
     */
    *otfItemsTrimPass() {
        for (const itemPos of this.boardItems) {

        }
    }

    /**
     * Dig holes in board surface
     */
    holesDiggingPass() {

    }

    /**
     * Chunk to override data in world chunk buffer
     */
    generateBoardChunk() {

    }
}