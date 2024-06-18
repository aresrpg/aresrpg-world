import { Box3, Vector3 } from 'three'

import { TreeGenerators, TreeType } from '../tools/TreeGenerator'

import { ProcLayer } from './ProcLayer'
import { BlockType } from './Biome'

export type EntityData = {
  // xzProj: number
  level: number
  type: TreeType
  bbox: Box3
  edgesOverlaps?: any
}

/**
 * # Vegetation
 * performed in multiple steps
 * - spawn: add vegetation items
 * - prune: remove overlapping items at the edges
 * - gen: generate blocks above ground
 */
export class Vegetation {
  treeMap: ProcLayer
  params = {
    treeRadius: 5,
    treeSize: 10,
    spawnThreshold: 4,
  }

  treeCache: Box3[] = []
  // eslint-disable-next-line no-use-before-define
  static singleton: Vegetation

  constructor() {
    this.treeMap = new ProcLayer('treemap')
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
  fillBuffer(
    blockPos: Vector3,
    entity: EntityData,
    buffer: BlockType[],
    treeParams = this.params,
  ) {
    const { treeRadius, treeSize } = treeParams
    const entityPos = entity.bbox.getCenter(new Vector3())
    entityPos.y = entity.bbox.min.y
    const treeBuffer: BlockType[] = []
    const vDiff = blockPos.clone().sub(entityPos)
    const offset = vDiff.y
    const count = treeSize - offset
    vDiff.y = 0
    const xzProj = vDiff.length()
    if (xzProj && count > 0) {
      // fill tree base
      new Array(count)
        .fill(BlockType.NONE)
        .forEach(item => treeBuffer.push(item))
      // tree foliage
      for (let y = -treeRadius; y < treeRadius; y++) {
        const blockType = TreeGenerators[entity.type as TreeType](
          xzProj,
          y,
          treeRadius,
        )
        treeBuffer.push(blockType)
      }
    } else {
      try {
        // a bit of an hack for now => TODO: find good fix
        new Array(count + treeRadius - Math.floor(treeSize * 0.4))
          .fill(BlockType.TREE_TRUNK)
          .forEach(item => treeBuffer.push(item))
      } catch (error) {
        // console.log(error)
      }
    }
    const sum = treeBuffer.reduce((sum, val) => sum + val, 0)
    if (sum > 0) {
      treeBuffer.forEach((elt, i) => {
        const current = buffer[i]
        if (current !== undefined) {
          buffer[i] = !buffer[i] ? elt : current
        } else {
          buffer.push(elt)
        }
      })
    }
    return sum > 0 ? treeBuffer : []
  }

  /**
   * Randomly spawn trees according to noise distribution
   * and non overlapping with other trees
   */
  spawnEntity(pos: Vector3, prng: any) {
    const { spawnThreshold, treeRadius } = this.params
    const size = 2 * treeRadius + 2
    const dims = new Vector3(size, 0, size)
    const bbox = new Box3().setFromCenterAndSize(pos, dims)
    bbox.min.y = 0
    bbox.max.y = 0

    const entityData: EntityData = {
      level: 0,
      type: TreeType.None,
      bbox,
    }

    const isSpawning = prng() * this.treeEval(pos) < spawnThreshold
    return isSpawning ? entityData : null
    // const center = treeBbox.getCenter(new Vector3())
    // const level = Heightmap.instance.getGroundPos(center)
    // const size = Math.abs(level - startPos.y)
  }

  /**
   * Pruning strategy
   * - try removing the lesser trees to match criteria
   * - remove tree spawning further away from patch center in priority
   * - keep top left trees in priority
   */
  pruneExcessSpawn() {}
}
