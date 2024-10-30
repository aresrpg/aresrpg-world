import { Vector3, Box2, Vector2 } from "three";
import { WorldComputeProxy } from "../api/WorldComputeProxy";
import { BlockData, BlockMode, PatchBlock } from "../utils/types";
import { asBox2, asVect2, asVect3 } from "../utils/common";
import { BoardContainer, BoardParams } from "./BoardContainer";
import { ItemsInventory } from "../misc/ItemsInventory";
import { BlockType } from "../procgen/Biome";
import { WorldPatch } from "./WorldPatch";

/**
 * Board patch generation by overriding ground patch output on-the-fly
 */
export class BoardPatch extends WorldPatch {
    boardParamsRef: BoardParams
    boardBounds: Box2
    boardItems: Vector2[] = []

    constructor(boundsOrPatchKey: string | Box2, boardParamsRef: BoardParams) {
        super(boundsOrPatchKey);
        this.boardParamsRef = boardParamsRef
        this.boardBounds = new Box2()
    }

    isWithinBoard(blockPos: Vector3) {
        let isInsideBoard = false
        const { thickness, radius, center } = this.boardParamsRef
        if (blockPos) {
            const heightDiff = Math.abs(blockPos.y - center.y)
            const dist = asVect2(blockPos).distanceTo(asVect2(center))
            isInsideBoard = dist <= radius && heightDiff <= thickness
        }
        // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
        return isInsideBoard
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

    isGroundHole(testPos: Vector3) {
        return BoardContainer.boardHolesLayer.eval(testPos) < 0.15
    }

    /**
     * Overrides patch ground data with board data 
     * @param iterBounds 
     * @param skipMargin 
     */
    override readBlockData(blockIndex: number): BlockData {
        const blockData = super.readBlockData(blockIndex)
        const blockLocPos = this.getLocalPosFromIndex(blockIndex)
        const blockPos = this.toWorldPos(blockLocPos)
        const boardLevel = this.boardParamsRef.center.y
        if (this.isWithinBoard(asVect3(blockPos, blockData.level))) {
            const isGroundHole = this.isGroundHole(blockPos)
            blockData.mode = isGroundHole ? BlockMode.DEFAULT : BlockMode.BOARD_CONTAINER
            blockData.type = isGroundHole ? BlockType.HOLE : blockData.type
            blockData.level = isGroundHole ? boardLevel - 1 : boardLevel
            // block.pos.y = boardLevel
        }
        return blockData
    }


    override async retrieveOvergroundItems() {
        await super.retrieveOvergroundItems()
        const externalItemsChunks = []
        // prune items within or overlapping with board 
        for await (const [item_type, spawn_places] of Object.entries(this.overgroundItems)) {
            const items_backup = spawn_places.splice(0)
            for await (const spawnOrigin of items_backup) {
                // separate items spawning inside board
                if (this.isWithinBoard(spawnOrigin)) {
                    this.boardItems.push(asVect2(spawnOrigin))
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
                        externalItemsChunks.push(itemChunk)
                    }
                }
            }
            
        }
        // return externalItemsChunks
    }

    /**
     * Add trimmed items above board
     */
    itemsTrimPass() {

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