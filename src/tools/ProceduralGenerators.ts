import { Vector3, Vector2, Box3 } from 'three'
import { asVect2 } from '../common/utils'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { BlockType, PseudoDistributionMap } from '../index'

export type TreeDef = {
  // type: TreeKind,
  size: number,
  radius: number
}

export abstract class ProceduralTree {
  // type
  size
  radius

  constructor(size: number, radius: number) {
    // super(new Box3(new Vector3(), new Vector3(2 * radius, size, 2 * radius)))
    this.size = size
    this.radius = radius
    // this.type = type
  }

  abstract generate(xzProj: number, y: number, range: number): BlockType;

  // get key() {
  //   const { size, radius, type } = this
  //   const treeDef = {
  //     size, radius, type
  //   }
  //   return treeKey(treeDef)
  // }

  voxelize() {
    const { size: treeSize, radius: treeRadius } = this
    const treeBounds = new Box3(new Vector3(), new Vector3(2 * treeRadius, treeSize, 2 * treeRadius))
    const treeChunk = new ChunkContainer(treeBounds)
    const entityPos = treeBounds.getCenter(new Vector3())
    const { min, max } = treeBounds
    let index = 0
    const chunkIter = treeChunk.iterateContent()
    for (const chunkBlock of chunkIter) {
      const { x, y, z } = chunkBlock.localPos
      const xzProj = new Vector2(x, z).sub(asVect2(entityPos))
      if (xzProj.length() > 0) {
        if (y < min.y + treeSize) {
          // empty space around trunk between ground and trunk top
          treeChunk.rawData[index++] = BlockType.NONE
        } else {
          // tree foliage
          const blockType = this.generate(
            xzProj.length(),
            y - (min.y + treeSize + treeRadius),
            treeRadius,
          )
          treeChunk.rawData[index++] = blockType
        }
      } else {
        // tree trunk
        treeChunk.rawData[index++] = BlockType.TREE_TRUNK
      }
    }
  }
}

export class AppleTree extends ProceduralTree {
  distribution: PseudoDistributionMap
  constructor(size: number, radius: number) {
    super(size, radius)
    this.distribution = new PseudoDistributionMap()
  }
  generate(xzProj: number, y: number, range: number): BlockType {
    const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
    const isFoliage = dist <= range
    return isFoliage ? BlockType.TREE_FOLIAGE : BlockType.NONE
  }

}

export class PineTree extends ProceduralTree {
  distribution: PseudoDistributionMap
  constructor(size: number, radius: number) {
    super(size, radius)
    this.distribution = new PseudoDistributionMap()
  }
  generate(xzProj: number, y: number, range: number): BlockType {
    const dist = xzProj // xzProj*(y+radius)
    const isFoliage = dist <= range * (1 - (0.35 * (y + range)) / range)
    return isFoliage ? BlockType.TREE_FOLIAGE_2 : BlockType.NONE
  }
}