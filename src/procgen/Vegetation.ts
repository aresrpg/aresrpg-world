import alea from "alea"
import { Vector2, Vector3 } from "three"
import { ProcLayer } from './ProcLayer'
import { BlockType } from "./BlocksMapping"
/**
 * # Vegetation
 * - `Treemap`
 */
export class Vegetation {
    treeMap: ProcLayer
    treeBuffer: any = {}
    prng
    params = {
        treeRadius: 5,
        treeSize: 5,
        treeThreshold: 1
    }
    constructor() {
        this.treeMap = new ProcLayer('treemap')
        this.prng = alea('tree_map')
    }
    treeEval(pos: Vector3) {
        let val = this.treeMap?.eval(pos)
        const treeEval = val ? 16 * Math.round(Math.exp((1 - val) * 10)) : 0
        return treeEval
    }

    treeGen(bbox: Box3) {
        const startTime = Date.now()
        const { treeThreshold } = this.params
        // init prng for tree distribution
        const prng = alea('tree_map')
        let trees = []
        for (let { x } = bbox.min; x < bbox.max.x; x++) {
            for (let { z } = bbox.min; z < bbox.max.z; z++) {
                const blockPos = new Vector3(x, 0, z)
                // check tree existence
                const treeEval = this.treeEval(blockPos)
                const isTree = prng() * treeEval < treeThreshold
                if (isTree) {
                    this.treeBuffer[x] = this.treeBuffer[x] || {}
                    this.treeBuffer[x][z] = true
                }
                // if(isTree){
                //     current.data.treeSpawn && 
                // }
            }
        }
    }

    fillHeightBuffer(blockPos: Vector3, { treeRadius, treeSize } = this.params) {
        const treeBuffer = []
        const { x, y, z } = blockPos
        const { level, xzProj } = this.treeBuffer[x]?.[z] || 0
        const radius = treeRadius
        if (level) {
            const offset = y - level
            let i = 0
            const count = treeSize - offset
            // tree base
            while (i++ <= count) {
                treeBuffer.push(xzProj ? BlockType.NONE : BlockType.TREE_TRUNK)
            }
            if (xzProj) {
                for (let y = -radius; y < radius; y++) {
                    const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
                    const f = dist <= radius ? BlockType.TREE_FOLIAGE : BlockType.NONE
                    treeBuffer.push(f)
                }
            } else {
                while (i++ < (count + radius))
                    treeBuffer.push(BlockType.TREE_TRUNK)

            }
        }
        return treeBuffer
    }

    genTree(radius = this.params.treeRadius) {
        const treeModel = []
        for (let x = -radius; x <= radius; x++) {
            for (let y = -radius; y <= radius; y++) {
                const vect = new Vector2(x, y)
                treeModel.push(vect.length())
            }
        }
        return treeModel
    }

    insertTree(startPos: Vector3, treeModel: []) {
        const treeSize = Math.sqrt(treeModel.length)
        const endPos = startPos.clone().addScalar(treeSize)
        const level = startPos.y
        let index = 0
        for (let { x } = startPos; x < endPos.x; x++) {
            for (let { z } = startPos; z < endPos.z; z++) {
                const xzProj = treeModel[index]
                this.treeBuffer[x] = this.treeBuffer[x] || {}
                this.treeBuffer[x][z] = { level, xzProj }
                index++
            }
        }
    }

    treeSpawner(blockPos: Vector3, rawVal: number) {
        const { treeThreshold } = this.params
        const { x, z } = blockPos
        // const { mappingRanges } = WorldGenerator.instance.blocksMapping
        // const mappingRange = Utils.findMatchingRange(rawVal, mappingRanges)
        // check existing tree in buffer
        const existingTree = this.treeBuffer[x]?.[z] //&& mappingRange.data.treeSpawn
        if (!existingTree) {
            // check random spawn
            const randomSpawn = this.prng() * this.treeEval(blockPos)
            if (randomSpawn < treeThreshold) {
                const treeModel = this.genTree()
                this.insertTree(blockPos, treeModel)
            }
        }
        return this.treeBuffer[x]?.[z]
    }
}