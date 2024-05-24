import { Box3, Vector2, Vector3 } from "three";
import { BlockGenData } from "../common/types";
import { Heightmap } from "../index";
import { Biome, BiomeType, BlockType } from "./Biome";
import { Vegetation } from "./Vegetation";

export class BlockCacheData {
    level = 0
    type = BlockType.NONE
    genData: Partial<BlockGenData> = {}
    overground: BlockType[] = []
    underground: BlockType[] = []
}

export type BlockIterData = {
    pos: Vector3;
    cache: BlockCacheData;
}

export type BlockIteratorRes = IteratorResult<BlockIterData, void>

enum PatchState {
    Pending,
    Ready,
    Outdated
}

export class BlocksPatch {
    static cache: BlocksPatch[] = []
    static gridRadius = 8
    static patchSize = Math.pow(2, 6)
    static bbox = new Box3(new Vector3(), new Vector3())
    bbox: Box3
    dimensions = new Vector3()
    // static patchSize
    // origin: Vector2
    // gridCoords = {
    //     col:0,
    //     row:0
    // }
    biomeType: BiomeType  // biome at patch center
    blocks: BlockCacheData[] = []
    state = PatchState.Pending
    stats = {
        generated: 0,
        totalGenTime: 0
    }
    constructor(bbox: Box3) {
        this.bbox = bbox.clone()
        // will be adjusted upon patch filling
        this.bbox.min.y = 0
        this.bbox.max.y = 255
        this.bbox.getSize(this.dimensions)
        // init patch biome
        const patchCenter = bbox.getCenter(new Vector3())
        this.biomeType = Biome.instance.getBiomeType(patchCenter)
        BlocksPatch.cache.push(this)
        console.log(`patch`)
    }

    static updateCache(pos: Vector3) {
        console.log(pos)
        const startTime = Date.now()
        // invalidate current cache, marking all patches as outdated
        this.cache.forEach(patch => patch.state = PatchState.Outdated)
        const gridCenter = new Vector2(0, 0)
        const gridRange = {
            min: gridCenter.clone().subScalar(this.gridRadius),
            max: gridCenter.clone().addScalar(this.gridRadius)
        }
        let patchCount = 0
        for (let row = gridRange.min.x; row <= gridRange.max.x; row++) {
            for (let col = gridRange.min.y; col <= gridRange.max.y; col++) {
                const patchStart = new Vector3(row * BlocksPatch.patchSize - 1, 0, col * BlocksPatch.patchSize - 1)
                const patchEnd = new Vector3((row + 1) * BlocksPatch.patchSize + 1, 0, (col + 1) * BlocksPatch.patchSize + 1)
                const bbox = new Box3(patchStart, patchEnd)
                const patch = BlocksPatch.getPatch(bbox, true) as BlocksPatch
                if (patch.state === PatchState.Pending) {
                    BlocksPatch.buildPatch(patch)
                    patch?.bbox.getSize(patch.dimensions)
                    patchCount++
                }
            }
        }
        // remove remaining outdated patches
        this.cache = this.cache.filter(patch => patch.state !== PatchState.Outdated)
        const elapsedTime = Date.now() - startTime
        console.log(`${patchCount} patches generated in ${elapsedTime} ms`)
    }

    static getPatch(input: Box3 | Vector3, createIfMissing = false) {
        let existing
        const point = input instanceof Box3 ? (input as Box3).getCenter(new Vector3) :
            (input as Vector3).clone()
        existing = this.cache.find(patch => {
            point.y = patch.bbox.getCenter(new Vector3).y
            return patch.bbox.containsPoint(point)
        })
        if (createIfMissing && !existing) {
            let minx = point.x - point.x % this.patchSize
            minx -= point.x < 0 ? this.patchSize : 0
            let minz = point.z - point.z % this.patchSize
            minz -= point.z < 0 ? this.patchSize : 0
            const bmin = new Vector3(minx, 0, minz)
            const bmax = bmin.clone().addScalar(this.patchSize)
            const bbox = new Box3(bmin, bmax)
            bbox.expandByScalar(1)
            existing = new BlocksPatch(bbox)
        }
        return existing
    }

    /**
     * getting pre-calculated block from cache
     */
    static getBlock(blockPos: Vector3, autoCreate = false) {
        // find patch containing point in cache
        const patch = this.getPatch(blockPos, autoCreate)
        let block
        if (patch) {
            const localPos = blockPos.clone().sub(patch.bbox.min)
            block = patch.getBlock(localPos, autoCreate)
        } else {
            console.log(`block not found`)
        }
        return block
    }

    static setBlock(blockPos: Vector3, block: BlockCacheData) {
        // find patch containing point in cache
        const patch = this.getPatch(blockPos)
        if (patch) {
            const localPos = blockPos.clone().sub(patch.bbox.min)
            patch.setBlock(localPos, block)
        } else {
            console.log(blockPos)
        }
        return block
    }

    getBlock(localPos: Vector3, autoCreate = false) {
        const blockIndex = localPos.x * this.dimensions.x + localPos.z
        if (!this.blocks[blockIndex] && autoCreate) {
            this.blocks[blockIndex] = new BlockCacheData()
        }
        return this.blocks[blockIndex]
    }

    setBlock(localPos: Vector3, blockData: BlockCacheData) {
        const { bbox } = this
        const blockIndex = localPos.x * this.dimensions.x + localPos.z
        this.blocks[blockIndex] = blockData
        const levelMax = blockData.level + blockData.overground.length
        bbox.min.y = Math.min(bbox.min.y, levelMax)
        bbox.max.y = Math.max(bbox.max.y, levelMax)
    }

    * blockIterator(useLocalCoords?: boolean) {
        const localBbox = new Box3(new Vector3(0), this.dimensions)
        const bbox = useLocalCoords ? localBbox : this.bbox
        const { biomeType: biome } = this
        let index = 0
        for (let { x } = bbox.min; x < bbox.max.x; x++) {
            for (let { z } = bbox.min; z < bbox.max.z; z++) {
                const pos = new Vector3(x, 0, z)
                // const index = x * this.dimensions.x + z
                const cache = this.blocks[index] || new BlockCacheData()
                this.blocks[index] = cache
                cache.genData.biome = this.biomeType
                const blockData: BlockIterData = {
                    pos,
                    cache
                }
                index++
                yield blockData
            }
        }
    }

    static buildPatch(patch: BlocksPatch) {
        const { bbox } = patch
        // fill tree buffer
        // this.vegetation.treeGen(bbox)
        // sampling volume
        const blockIter = patch.blockIterator()
        bbox.min.y = 255
        bbox.max.y = 0
        let item: BlockIteratorRes = blockIter.next()
        while (!item.done) {
            const blockData = item.value
            Heightmap.instance.getGroundPos(blockData)
            Biome.instance.getBlockType(blockData)
            const treeType = blockData.cache.genData.tree?.type
            if (!blockData.cache.genData.tree?.levelRef && treeType && Vegetation.instance.isSpawningTree(blockData.pos)) {
                Vegetation.instance.markTreeBlocks(blockData.pos, treeType)
            }
            if (blockData.cache.genData.tree?.levelRef) {
                // console.log(blockData.pos)
                Vegetation.instance.fillTreeBuffer(blockData.cache)
            }
            const levelMax = blockData.cache.level + blockData.cache.overground.length
            bbox.min.y = Math.min(bbox.min.y, levelMax)
            bbox.max.y = Math.max(bbox.max.y, levelMax)
            // clear temporary data
            blockData.cache.genData = {}
            item = blockIter.next()
        }
        BlocksPatch.bbox.union(bbox)
    }
}