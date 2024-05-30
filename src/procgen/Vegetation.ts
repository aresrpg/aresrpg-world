import alea from 'alea'
import { Box3, Vector2, Vector3 } from 'three'

import { TreeGenerators, TreeType } from '../tools/TreeGenerator'

import { ProcLayer } from './ProcLayer'
import { BlockType } from './Biome'
import { BlockCacheData, BlocksPatch } from './BlocksPatch'
import { Heightmap } from './Heightmap'

export type TreeData = {
  xzProj: number
  level: number
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
    treeSize: 10,
    treeThreshold: 1,
  }

  treeCache: Box3[] = []
  // eslint-disable-next-line no-use-before-define
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

  mergeBuffers(srcBuffer: BlockType[], dstBuffer: BlockType[]) {
    // console.log(`merging buffers: `, srcBuffer, dstBuffer)
    const merged = []
    srcBuffer.reverse()
    dstBuffer.reverse()
    while (srcBuffer.length || dstBuffer.length) {
      const val = srcBuffer.pop() || dstBuffer.pop()
      merged.push(val)
    }
    // console.log(`result: `, merged)
    return merged
  }

  /**
   * Using precached tree data and block level to fill tree blocks buffer
   * @param treeData
   * @param blockLevel
   * @param treeParams
   * @returns
   */
  fillTreeBuffer(
    treeData: TreeData,
    blockLevel: number,
    treeParams = this.params,
  ) {
    const { treeRadius, treeSize } = treeParams
    const treeBuffer: BlockType[] = []
    if (treeData && treeBuffer) {
      const offset = blockLevel - treeData.level
      const count = treeSize - offset

      if (treeData.xzProj && count > 0) {
        // fill tree base
        new Array(count)
          .fill(BlockType.NONE)
          .forEach(item => treeBuffer.push(item))
        // tree foliage
        for (let y = -treeRadius; y < treeRadius; y++) {
          const blockType = TreeGenerators[treeData.type as TreeType](
            treeData.xzProj,
            y,
            treeRadius,
          )
          treeBuffer.push(blockType)
        }
      } else {
        try {
          // a bit of an hack for now => TODO: find good fix
          new Array(count + treeRadius - Math.floor(treeData.size * 0.4))
            .fill(BlockType.TREE_TRUNK)
            .forEach(item => treeBuffer.push(item))
        } catch (error) {
          // console.log(error)
        }
      }
    }
    return treeBuffer
  }

  /**
   * Placeholder for data used in tree generation
   * which will happen later when final block level is known
   */
  markTreeBlocks(
    startPos: Vector3,
    type: TreeType,
    range = this.params.treeRadius,
  ) {
    // console.log(`tree spawn at: `, startPos)
    const endPos = startPos.clone().addScalar(2 * range + 2)
    const treeBbox = new Box3(
      startPos,
      endPos,
    )
    const center = treeBbox.getCenter(new Vector3())
    const level = Heightmap.instance.getGroundPos(center)
    const size = Math.abs(level - startPos.y)
    treeBbox.min.y = 0
    treeBbox.max.y = 0
    const treeOverlap = !!Vegetation.instance.treeCache.find(bbox =>
      bbox.intersectsBox(treeBbox),
    )
    let skipped = 0
    if (!treeOverlap) {
      // console.log(treeBbox.min, treeBbox.max)
      Vegetation.instance.treeCache.push(treeBbox)
      for (let x = -range; x <= range; x++) {
        for (let z = -range; z <= range; z++) {
          const vect = new Vector2(x, z)
          const xzProj = vect.length()
          const xIndex = startPos.x + range + x
          const zIndex = startPos.z + range + z
          const blockPos = new Vector3(xIndex, 0, zIndex)
          const treeData = {
            xzProj,
            level,
            size,
            type,
          }

          let block = BlocksPatch.getBlock(blockPos) as BlockCacheData
          if (!block) {
            // console.log(blockPos)
            block = new BlockCacheData()
            // create patch if block belongs to another patch
            BlocksPatch.getPatch(blockPos, true)
            // if (patch)
            BlocksPatch.setBlock(blockPos, block)
          }
          // else if (block.level && block.overground.length === 0) {
          //   console.log(`[markTreeBlocks] prefill tree buffer`)
          //   Vegetation.instance.fillTreeBuffer(treeData, block.level)
          // }

          // safety check, shouldn't happen
          if (!block.genData.tree?.level) {
            block.genData.tree = treeData
          } else {
            skipped++
          }
        }
      }
    } else {
      // console.log(`skip overlaping tree`, startPos)
    }
    if (skipped) {
      console.log(`${skipped} skipped blocks belonging to other tree data `)
      // console.log(`current tree `, startPos, ` has overlap with `, overlappingTree)
    }
  }

  /**
   * Randomly spawn trees according to noise distribution
   */
  isSpawningTree(blockPos: Vector3) {
    const { treeThreshold } = this.params
    const randomSpawn = this.prng() * this.treeEval(blockPos)
    return randomSpawn < treeThreshold
  }
}
