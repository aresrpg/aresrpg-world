import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { ProcLayer } from './ProcLayer'
import { TreeGenerators, TreeType } from '../tools/TreeGenerator'
import { BlockType } from './Biome'
import { BlockCacheData, BlocksPatch } from './BlocksPatch'

export type TreeData = {
  xzProj: number,
  levelRef: number,
  type: TreeType
}
/**
 * # Vegetation
 * - `Treemap`
 */
export class Vegetation {
  treeMap: ProcLayer
  prng
  params = {
    treeRadius: 5,
    treeSize: 5,
    treeThreshold: 1,
  }
  treeCache: Box3[] = []

  static singleton: Vegetation

  constructor() {
    this.treeMap = new ProcLayer('treemap')
    this.prng = alea('tree_map')
  }

  static get instance() {
    Vegetation.singleton = Vegetation.singleton || new Vegetation()
    return Vegetation.singleton
  }

  treeEval(pos: Vector3) {
    const val = this.treeMap?.eval(pos)
    const treeEval = val ? 16 * Math.round(Math.exp((1 - val) * 10)) : 0
    return treeEval
  }

  fillTreeBuffer(block: BlockCacheData, treeData?: TreeData, treeParams = this.params) {
    const { treeRadius, treeSize } = treeParams
    const treeBuffer = block?.overground
    treeData = treeData || block.genData.tree
    if (treeData && treeBuffer) {
      const offset = block.level - treeData.levelRef
      const count = treeSize - offset

      if (treeData.xzProj && count > 0) {
        // fill tree base
        new Array(count).fill(BlockType.NONE).forEach(item => treeBuffer.push(item))
        // tree foliage
        for (let y = -treeRadius; y < treeRadius; y++) {
          const blockType = TreeGenerators[treeData.type as TreeType](treeData.xzProj, y, treeRadius)
          treeBuffer.push(blockType)
        }
      } else {
        try {
          new Array(count + treeRadius).fill(BlockType.TREE_TRUNK).forEach(item => treeBuffer.push(item))
        } catch (error) {
          console.log(error)
        }
      }
      block.overground = [BlockType.TREE_TRUNK, BlockType.TREE_TRUNK]
    }

    return treeBuffer
  }

  /**
   * Placeholder storing tree building data
   */
  markTreeBlocks(startPos: Vector3, type: TreeType, range = this.params.treeRadius) {
    // console.log(`tree spawn at: `, startPos)
    const levelRef = Math.floor(startPos.y)
    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) {
        const vect = new Vector2(x, z)
        const xzProj = vect.length()
        const xIndex = startPos.x + range + x
        const zIndex = startPos.z + range + z
        const treeData = {
          xzProj,
          levelRef,
          type
        }
        const blockPos = new Vector3(xIndex, 0, zIndex)
        let block = BlocksPatch.getBlock(blockPos) as BlockCacheData
        if (!block) {
          // console.log(blockPos)
          block = new BlockCacheData()
          // create patch
          const patch = BlocksPatch.getPatch(blockPos, true)
          BlocksPatch.setBlock(blockPos, block)
        }
        block.genData.tree = treeData
        // if (!block) {
        //   console.log(blockPos)
        // }
        // this.fillTreeBuffer(block, treeData)
      }
    }
  }

  isSpawningTree(blockPos: Vector3) {
    const { treeThreshold } = this.params
    // const { mappingRanges } = WorldGenerator.instance.blocksMapping
    // const mappingRange = Utils.findMatchingRange(rawVal, mappingRanges)
    // check existing tree in buffer
    const block = BlocksPatch.getBlock(blockPos) || new BlockCacheData()
    if (block.overground.length === 0 && !block.genData.tree) {
      // check random spawn
      const randomSpawn = this.prng() * this.treeEval(blockPos)
      return randomSpawn < treeThreshold
    }
    return block.overground.length > 0
  }
}
