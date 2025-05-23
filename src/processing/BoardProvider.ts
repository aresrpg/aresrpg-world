import { Box2, Box3, Vector2, Vector3 } from 'three'

import {
    asBox2,
    asBox3,
    asVect2,
    asVect3,
    genChunkIds,
    getPatchId,
    getUpperScalarId,
    parsePatchKey,
    patchIndexFromMapRange,
    patchRangeFromBounds,
    serializePatchId,
} from '../utils/patch_chunk.js'
import { BlockType, ChunkId, PatchId, PatchKey } from '../utils/common_types.js'
import { PatchDataContainer } from '../datacontainers/PatchContainer.js'
import { DataChunkStub } from '../datacontainers/ChunkContainer.js'
import { WorldLocals } from '../config/WorldEnv.js'
import { ChunkBlocksContainer, SpawnChunk } from '../factory/ChunksFactory.js'
import { IdenticalDataAdapter, SolidBlockData, BlockDataType } from '../datacontainers/BlockDataAdapter.js'

import { ChunksProcessing } from './ChunksProcessing.js'
import { WorkerPool } from './WorkerPool.js'
import { ItemsTask } from './ItemsProcessing.js'

export enum BlockCategory {
    EMPTY = 0,
    FLAT = 1,
    HOLE = 2,
    OBSTACLE = 3,
}

// export type BoardBlock = {
//   type: BlockType
//   category: BlockCategory
// }

// export type BoardParams = {
//   center: Vector3
//   radius: number
//   thickness: number
// }

export type BoardStub = {
    bounds: Box2
    content: Uint8Array
    elevation?: number
}

export type BoardCacheData = {
    chunks: ChunkBlocksContainer[]
    items: SpawnChunk[]
}

class BoardPatch extends PatchDataContainer<number> {
    override dataAdapter = new IdenticalDataAdapter()
    rawData: Uint8Array

    constructor(bounds: Box2, margin = 0) {
        super(bounds, margin)
        this.rawData = new Uint8Array(this.extendedDims.x * this.extendedDims.y)
    }

    // override toStub(): BoardStub {
    //     const { rawData, bounds } = this
    //     return {
    //         bounds,
    //         // elevation: 0,
    //         content: rawData,
    //     }
    // }

    // override *iterData(globalBounds?: Box2 | undefined, includeMargins?: boolean, skipEmpty = true) {
    //     const elements = super.iterData(globalBounds, includeMargins, )
    //     for (const element of elements) {
    //         const { index } = element
    //         const data = this.rawData[index] || BlockCategory.EMPTY
    //         if (data || !skipEmpty) {
    //             const boardElement: PatchDataIteration<number> = {
    //                 ...element,
    //                 data,
    //             }
    //             yield boardElement
    //         }
    //     }
    // }

    override containsPoint(pos: Vector2) {
        const localPos = this.toLocalPos(pos)
        const index = this.getIndex(localPos)
        const val = this.rawData[index]
        return !!val
    }
}

/**
 * Handle chunks and items tasks and provide data required to build board content:
 */
export class BoardCacheProvider {
    // eslint-disable-next-line no-undef
    workerPool: WorkerPool
    worldLocalEnv: WorldLocals
    localCache: BoardCacheData = {
        chunks: [],
        items: [],
    }

    // taskIndex: Record<TaskId, GenericTask> = {}
    patchRange = new Box2()
    patchIndex: Record<PatchKey, any> = {}
    pendingBoardGen = false

    // eslint-disable-next-line no-undef
    constructor(workerPool: WorkerPool, worldLocalEnv: WorldLocals) {
        this.workerPool = workerPool
        this.worldLocalEnv = worldLocalEnv
    }

    // constructor(centerPatchId: Vector2, patchRange: number) {
    //   this.centerPatchId = centerPatchId
    //   this.patchRange = patchRange
    // }

    get patchKeys() {
        return Object.keys(this.patchIndex)
    }

    get chunkIds() {
        const { bottomId, topId } = this.worldLocalEnv.getChunksVerticalRange()
        const chunkIds: ChunkId[] = []
        this.patchKeys.forEach(patchKey => {
            const patchId = parsePatchKey(patchKey) as PatchId
            chunkIds.push(...genChunkIds(patchId, bottomId, topId))
        })
        return chunkIds
    }

    get chunks() {
        return this.localCache.chunks
    }

    get items() {
        return this.localCache.items
    }

    /**
     * call each time cache board params changes
     */
    loadData = async (center: Vector2, radius: number) => {
        const dims = new Vector2(radius, radius).floor().multiplyScalar(2)
        const bounds = new Box2().setFromCenterAndSize(center.clone().floor(), dims)
        const patchRange = patchRangeFromBounds(bounds, this.worldLocalEnv.getPatchDimensions())
        const changed = !patchRange.equals(this.patchRange)
        if (changed) {
            this.pendingBoardGen = true
            this.patchRange = patchRange
            // regen patch index from current board position
            const patchIndex = patchIndexFromMapRange(patchRange)
            // enqueue chunks processing tasks
            const chunksPendingTasks = Object.keys(patchIndex)
                .filter(patchKey => !this.patchIndex[patchKey])
                .map(patchKey => ChunksProcessing.fullChunks(patchKey))
                .map(chunkTask => {
                    chunkTask.processingParams.skipEntities = true
                    chunkTask.processingParams.skipBlobCompression = true
                    chunkTask.processingParams.skipEmpty = true
                    const pendingChunkTask = chunkTask.delegate(this.workerPool)
                    // once done put result in cache
                    pendingChunkTask.then(taskRes => {
                        // reconstruct objects from stubs
                        const chunks = taskRes.map((chunkStub: DataChunkStub) => new ChunkBlocksContainer().fromStub(chunkStub))
                        this.localCache.chunks.push(...chunks)
                    })
                    return pendingChunkTask
                })
            // enqueue items processing tasks
            const itemsPendingTasks = Object.keys(patchIndex)
                .filter(patchKey => !this.patchIndex[patchKey])
                .map(patchKey => ItemsTask.sparsedChunks(patchKey)) // new ItemsTask().individualChunks(patchKey))
                .map(itemTask => {
                    const pendingItemTask = itemTask.delegate(this.workerPool)
                    // once done put result in cache
                    pendingItemTask.then(taskRes => {
                        this.localCache.items.push(...(taskRes as SpawnChunk[]))
                    })
                    return pendingItemTask
                })
            // update index
            this.patchIndex = patchIndex
            await Promise.all([...chunksPendingTasks, ...itemsPendingTasks])
            // console.log(`BoardCache: ready!`)
        }
    }

    /**
     * fills target chunk from cache
     */
    fillTargetChunk(targetChunk: ChunkBlocksContainer) {
        this.localCache.chunks.forEach(sourceChunk => sourceChunk.copyContentToTarget(targetChunk))
        // itemsChunks.forEach(itemSource =>
        //   ChunkContainer.copySourceToTarget(itemSource, boardTarget),
        // )
    }

    getSpawnedItems(bounds: Box3) {
        const spawnedItems = this.localCache.items.filter(chunk => chunk.bounds.intersectsBox(bounds))
        return spawnedItems
    }
}

type BoardContent = {
    chunk: ChunkBlocksContainer
    patch: BoardPatch
}

/**
 * Call:
 * - `start` to create unique board instance at specific location
 * - `terminate` to remove board instance
 */
export class BoardProvider {
    cacheProvider: BoardCacheProvider
    boardCenter = new Vector3()

    finalBounds = new Box2()
    boardData!: BoardPatch
    worldLocalEnv: WorldLocals
    constructor(
        boardCenter: Vector3,
        cacheProvider: BoardCacheProvider,
        worldLocalEnv: WorldLocals,
        // dedicatedWorkerPool: WorkerPool,// = WorkerPool.default,
    ) {
        const { radius, thickness } = worldLocalEnv.rawSettings.boards
        this.worldLocalEnv = worldLocalEnv
        this.boardCenter = boardCenter.clone().floor()

        // const holesLayer = new ProcLayer('holesMap')
        // holesLayer.sampling.periodicity = 0.25
        this.cacheProvider = cacheProvider // new BoardCacheProvider(dedicatedWorkerPool)
        // this.center = boardCenter
        console.log(`create board at ${serializePatchId(this.centerPatchId)} (radius: ${radius}, thickness: ${thickness})`)
    }

    get boardThickness() {
        return this.worldLocalEnv.rawSettings.boards.thickness
    }

    get boardRadius() {
        return this.worldLocalEnv.rawSettings.boards.radius
    }

    get centerPatchId() {
        return getPatchId(asVect2(this.boardCenter), this.worldLocalEnv.getPatchDimensions())
    }

    get patchRange() {
        return getUpperScalarId(this.boardRadius, this.worldLocalEnv.getPatchSize())
    }

    get initialDims() {
        const { boardRadius, boardThickness } = this
        const boardDims = new Vector3(boardRadius, boardThickness, boardRadius).multiplyScalar(2)
        return boardDims
    }

    get initialBounds() {
        const initialBounds = new Box3().setFromCenterAndSize(this.boardCenter, this.initialDims)
        return initialBounds
    }

    get boardElevation() {
        return this.boardCenter.y
    }

    get groundCenter() {
        return asVect2(this.boardCenter)
    }

    isWithinBoard(buffPos: Vector2, buffer: Uint16Array) {
        if (buffPos) {
            const lastBlock = buffer[buffer.length - 2]
            // const isFull = buffer.slice(1, -1).find(val => val === 0) === undefined
            const centerDist = buffPos.distanceTo(this.groundCenter)
            const isInside = centerDist <= this.boardRadius && lastBlock === 0
            return isInside
        }
        // isInsideBoard && this.boardBounds.expandByPoint(asVect2(blockPos))
        return false
    }

    overlapsBoard(bounds: Box2) {
        if (this.boardData) {
            // const boardIter = this.boardData.iterDataQuery(bounds, true)
            // return !!boardIter.next()
            return this.boardData.bounds.intersectsBox(bounds)
        }
        return false
    }

    get nonOverlappingItemsChunks() {
        const matching = this.cacheProvider.items.filter(itemChunk => !this.overlapsBoard(asBox2(itemChunk.bounds)))
        return matching
    }

    overrideHeightBuffer = (heightBuff: Uint16Array, isHoleBlock: boolean) => {
        const { dataAdapter } = ChunkBlocksContainer

        const isSpriteBlock = (rawVal: number) => dataAdapter.decode(rawVal).dataType === BlockDataType.SpriteBlock

        const reencodeSurfaceBlock = (rawVal: number, isCheckerBlock = true) => {
            const decodedBlock = dataAdapter.decode(rawVal)
            const { blockType } = decodedBlock.data as SolidBlockData
            return dataAdapter.encodeSolidBlock(blockType, isCheckerBlock)
        }
        const { boardThickness } = this
        // const marginBlockType = isHoleBlock ? BlockType.HOLE : heightBuff[0]
        const surfaceBlock = heightBuff
            .slice(1, boardThickness + 1)
            .reverse()
            .find(val => !!val && !isSpriteBlock(val))
        const boardHeightBuffer = heightBuff.map((rawVal, i) => {
            // return i <= boardThickness ? val : BlockType.NONE
            if (i > boardThickness) {
                return 0
            } else {
                const isCheckerBlock = i === boardThickness // ? BlockMode.CHECKERBOARD : BlockMode.REGULAR
                if (isHoleBlock) {
                    if (i < boardThickness) return dataAdapter.encodeSolidBlock(BlockType.HOLE, isCheckerBlock)
                } else if (!rawVal || isSpriteBlock(rawVal)) {
                    if (surfaceBlock && isCheckerBlock) return reencodeSurfaceBlock(surfaceBlock)
                }
                return isCheckerBlock ? reencodeSurfaceBlock(rawVal) : rawVal
            }
        })

        return boardHeightBuffer
    }

    async genBoardContent(skipHoleBlocks = true) {
        // wait for cache to be filled
        await this.cacheProvider.loadData(this.groundCenter, this.boardRadius)
        // this.boardParams.center = center
        this.finalBounds.setFromPoints([this.groundCenter])
        const initialPatchBounds = asBox2(this.initialBounds)
        const boardPatch = new BoardPatch(initialPatchBounds)
        const boardChunk = new ChunkBlocksContainer(this.initialBounds, 1)
        // fill chunk from cache
        this.cacheProvider.fillTargetChunk(boardChunk)
        // const chunkHeightBuffers = boardChunk.iterChunkBuffers()
        // for (const heightBuff of chunkHeightBuffers) {
        for (const patchIter of boardPatch.iterData(undefined, true, false)) {
            const heightBuff = boardChunk.readRawBuffer(patchIter.localPos)
            const isWithinBoard = this.isWithinBoard(patchIter.pos, heightBuff)
            const isHoleBlock = isWithinBoard && heightBuff.slice(1, this.boardThickness + 1).reduce((sum, val) => sum + val, 0) === 0
            // const empty = chunkBuff.data.reduce((sum, val) => sum + val, 0) === 0
            // const full = chunkBuff.data.find(val => val === 0) === undefined
            isWithinBoard && this.finalBounds.expandByPoint(patchIter.pos)
            // update board patch bounds and data
            boardPatch.rawData[patchIter.index] =
                isWithinBoard && (!isHoleBlock || !skipHoleBlocks)
                    ? isHoleBlock
                        ? BlockCategory.HOLE
                        : BlockCategory.FLAT
                    : BlockCategory.EMPTY
            // override height buffer with board version if within board
            const finalHeightBuffer =
                isWithinBoard && (!isHoleBlock || !skipHoleBlocks) ? this.overrideHeightBuffer(heightBuff, isHoleBlock) : heightBuff // .map(val => this.externalDataEncoder(val))
            boardChunk.writeRawBuffer(patchIter.localPos, finalHeightBuffer)
            // boardPatch.
        }
        // compute final bounds & version of patch and chunk
        const finalChunkBounds = asBox3(this.finalBounds)
        finalChunkBounds.min.y = boardChunk.bounds.min.y
        finalChunkBounds.max.y = boardChunk.bounds.max.y
        const boardContent: BoardContent = {
            patch: new BoardPatch(this.finalBounds),
            chunk: new ChunkBlocksContainer(finalChunkBounds, 1),
        }
        boardPatch.copyContentToTarget(boardContent.patch)
        boardChunk.copyContentToTarget(boardContent.chunk)

        const boardSpawnedItems = this.cacheProvider.getSpawnedItems(boardChunk.bounds)
        this.addTrimmedItems(boardContent.patch, boardContent.chunk, boardSpawnedItems)
        this.boardData = boardContent.patch
        return boardContent
    }

    // trim items spawning inside board
    addTrimmedItems(boardPatch: BoardPatch, boardChunk: ChunkBlocksContainer, boardSpawnedItems: SpawnChunk[]) {
        for (const itemChunk of boardSpawnedItems) {
            const itemOffset = this.boardElevation - itemChunk.bounds.min.y
            // iter slice from item which is at same level as the board
            if (itemOffset >= 0) {
                for (const heightBuff of itemChunk.iterHeightBuffers()) {
                    const itemBlockData = heightBuff.content[itemOffset]
                    // if blocks belongs to board
                    if (itemBlockData && boardPatch.containsPoint(heightBuff.pos)) {
                        const itemBlockPos = asVect3(heightBuff.pos, this.boardElevation)
                        const chunkLocalPos = boardChunk.toLocalPos(itemBlockPos)
                        const chunkIndex = boardChunk.getIndex(chunkLocalPos)
                        // copy block to board chunk
                        // console.log(`writing item block to board`)
                        boardChunk.rawData[chunkIndex] = itemBlockData
                        // and mark block as obstacle in board patch
                        const patchLocalPos = boardPatch.toLocalPos(heightBuff.pos)
                        const patchIndex = boardPatch.getIndex(patchLocalPos)
                        boardPatch.rawData[patchIndex] = BlockCategory.OBSTACLE
                    }
                }
            }

            // const spawnPos = itemChunk.bounds.getCenter(new Vector3())
            // const spawnLocalPos = asVect2(boardBuffer.toLocalPos(spawnPos))
            // const treeBuff = []
            // boardBuffer.writeBuffer(spawnLocalPos, treeBuff);
            // TODO: compute item's footprint on board's ground to mark block as obstacles
            // slice chunk at one block above the board
            // const itemSlice = itemChunk.slice(this.boardElevation, this.boardElevation + 1)
            // ChunkContainer.copySourceToTarget(itemSlice, boardContent.chunk)
            // const itemElements = itemChunk.iterChunkBuffers(boardContent.chunk.bounds)
            // for (const itemElem of itemElements) {
            //   itemElem.pos
            //   itemElem.data
            // }
        }
    }

    *overrideOriginalChunksContent(boardChunk: ChunkBlocksContainer) {
        const { nonOverlappingItemsChunks } = this
        const chunkDim = this.worldLocalEnv.getChunkDimensions()
        // iter processed original chunks
        for (const originalChunk of this.cacheProvider.chunks) {
            // board_chunk.rawData.fill(113)
            const targetChunk = new ChunkBlocksContainer(undefined, originalChunk.margin).fromKey(originalChunk.chunkKey, chunkDim)
            originalChunk.rawData.forEach((val, i) => (targetChunk.rawData[i] = val))
            // copy items individually
            nonOverlappingItemsChunks.forEach(itemChunk => itemChunk.copyContentToTarget(targetChunk))
            // targetChunk.rawData.forEach((val, i) => (targetChunk.rawData[i] = this.externalDataEncoder(val)))
            // override with board_buffer
            boardChunk.copyContentToTarget(targetChunk, false)
            yield targetChunk
        }
    }

    *restoreOriginalChunksContent() {
        const chunkDim = this.worldLocalEnv.getChunkDimensions()
        // iter processed original chunks
        for (const originalChunk of this.cacheProvider.chunks) {
            // board_chunk.rawData.fill(113)
            const targetChunk = new ChunkBlocksContainer(undefined, originalChunk.margin).fromKey(originalChunk.chunkKey, chunkDim)
            originalChunk.rawData.forEach((val, i) => (targetChunk.rawData[i] = val))
            // copy items individually
            this.cacheProvider.items.forEach(itemChunk => itemChunk.copyContentToTarget(targetChunk))
            // targetChunk.rawData.forEach((val, i) => (targetChunk.rawData[i] = this.externalDataEncoder(val)))
            yield targetChunk
        }
    }
}
