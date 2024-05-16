import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { ProcLayer } from './ProcLayer'
import { BlockType } from './BlocksMapping'
import { TreeGenerators, TreeType } from '../tools/TreeGenerator'
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
    treeThreshold: 1,
  }

  constructor() {
    this.treeMap = new ProcLayer('treemap')
    this.prng = alea('tree_map')
  }

  treeEval(pos: Vector3) {
    const val = this.treeMap?.eval(pos)
    const treeEval = val ? 16 * Math.round(Math.exp((1 - val) * 10)) : 0
    return treeEval
  }

  treeGen(bbox: Box3) {
    // const startTime = Date.now()
    const { treeThreshold } = this.params
    // init prng for tree distribution
    const prng = alea('tree_map')
    // let trees = []
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
    let treeBuffer = []
    const { x, y, z } = blockPos
    const { groundLevel, xzProj, type: treeType } = this.treeBuffer[x]?.[z] || {}
    if (groundLevel) {
      const offset = y - groundLevel
      let i = 0
      const count = treeSize - offset

      if (xzProj && count > 0) {
        // tree base
        treeBuffer = new Array(count).fill(BlockType.NONE)
        // tree foliage
        for (let y = -treeRadius; y < treeRadius; y++) {
          const blockType = TreeGenerators[treeType](xzProj, y, treeRadius)//TreeGenerator.AppleTree(xzProj, y, treeRadius)
          treeBuffer.push(blockType)
        }
      } else {
        try {
          treeBuffer = new Array(count + treeRadius).fill(BlockType.TREE_TRUNK)
        } catch (error) {
          console.log(error)
        }
      }
    }
    return treeBuffer
  }

  /**
   * Placeholder storing tree building data
   */
  insertPreprocData(startPos: Vector3, type: TreeType, range = this.params.treeRadius) {
    const groundLevel = Math.floor(startPos.y)
    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        const vect = new Vector2(x, z)
        const xzProj = vect.length()
        const xIndex = startPos.x + range + x
        const zIndex = startPos.z + range + z
        this.treeBuffer[xIndex] = this.treeBuffer[xIndex] || {}
        this.treeBuffer[xIndex][zIndex] = { groundLevel, xzProj, type }
      }
    }
  }

  treeSpawner(blockPos: Vector3, type: TreeType | undefined) {
    const { treeThreshold } = this.params
    const { x, z } = blockPos
    // const { mappingRanges } = WorldGenerator.instance.blocksMapping
    // const mappingRange = Utils.findMatchingRange(rawVal, mappingRanges)
    // check existing tree in buffer
    const existingTree = this.treeBuffer[x]?.[z] // && mappingRange.data.treeSpawn
    if (!existingTree && type) {
      // check random spawn
      const randomSpawn = this.prng() * this.treeEval(blockPos)
      if (randomSpawn < treeThreshold) {
        this.insertPreprocData(blockPos, type)
      }
    }
    return this.treeBuffer[x]?.[z]
  }
}
