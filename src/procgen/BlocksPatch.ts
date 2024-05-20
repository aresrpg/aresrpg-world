import { Box3, Vector2, Vector3 } from "three";
import { Heightmap } from "../index";
import { Biome, BiomeType, BlockType } from "./Biome";
import { Vegetation } from "./Vegetation";

export type BlockCache = {
    level: number,
    type: number,
    overground: BlockType[]
    underground: BlockType[]
}

export type BlockIteratorData = {
    pos: Vector3;
    biome: BiomeType;
    data: Partial<BlockCache>;
}

export type BlockIteratorRes = IteratorResult<BlockIteratorData, void>

export class BlocksPatch {
    static cache: BlocksPatch[] = []
    static gridRadius = 8
    static patchSize = Math.pow(2, 6)
    bbox: Box3
    dimensions = new Vector3()
    // static patchSize
    // origin: Vector2
    // gridCoords = {
    //     col:0,
    //     row:0
    // }
    biomeType: BiomeType  // biome at patch center
    blocks: BlockCache[] = []
    stats = {
        generated: 0,
        totalGenTime: 0
    }
    constructor(bbox: Box3) {
        this.bbox = bbox.clone()
        // will be adjusted upon patch filling
        this.bbox.min.y = 255
        this.bbox.max.y = 0
        // init patch biome
        const patchCenter = bbox.getCenter(new Vector3())
        this.biomeType = Biome.instance.getBiomeType(patchCenter)
        BlocksPatch.cache.push(this)
        // console.log(`[BlocksPatch] created patch in cache: `, this.bbox)
    }

    static updateCache(pos: Vector3) {
        console.log(pos)
        const startTime = Date.now()

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
                const patch = BlocksPatch.getPatch(bbox) as BlocksPatch
                BlocksPatch.buildPatch(patch)
                patch?.bbox.getSize(patch.dimensions)
                patchCount++
            }
        }
        const elapsedTime = Date.now() - startTime
        console.log(`${patchCount} patches generated in ${elapsedTime} ms`)
    }

    static getPatch(bbox: Box3, createIfMissing = true) {
        let existing
        const bboxCopy = bbox.clone()
        bboxCopy.min.y = 0
        bboxCopy.max.y = 512
        existing = this.cache.find(patch => bboxCopy.containsBox(patch.bbox))
        return createIfMissing ? existing || new BlocksPatch(bbox) : existing
    }

    getBlockIndex(pos: Vector3) {
        return pos.x * this.dimensions.x + pos.z
    }

    getGroundBlock(indexOrPos: number | Vector3) {
        const blockIndex = indexOrPos instanceof Vector3 ? this.getBlockIndex(indexOrPos) : indexOrPos
        const blockCache = this.blocks[blockIndex]
        // const block: Block= {
        //     pos: new Vector3(),
        //     type: 
        // }
        return blockCache
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
                this.blocks[index] = this.blocks[index] || { level: 0, type: BlockType.NONE, overground: [], underground: [] }
                const data = this.blocks[index] as Partial<BlockCache>
                const block = {
                    pos,
                    biome,
                    data
                }
                index++
                yield block
            }
        }
    }

    static buildPatch(patch: BlocksPatch) {
        const { bbox } = patch
        // fill tree buffer
        // this.vegetation.treeGen(bbox)
        // sampling volume
        const blockIter = patch.blockIterator()
        let item: BlockIteratorRes = blockIter.next()
        while (!item.done) {
            const { pos } = item.value
            Heightmap.instance.getGroundBlock(pos, item.value)
            const level = item.value.data.level as number
            pos.y = level
            // init buffer
            item.value.data.overground = []
            const { overground } = item.value.data
            Vegetation.instance.fillTreeBuffer(item.value.pos, overground)
            const levelMax = level + overground.length
            bbox.min.y = Math.min(bbox.min.y, levelMax)
            bbox.max.y = Math.max(bbox.max.y, levelMax)
            item = blockIter.next()
        }
    }
}