import { Vector3, Vector2, Box3 } from 'three'
import { asVect2 } from '../common/utils'
import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { BlockType } from '../index'

export enum ProcItemCategory {
  Tree,
  Boulder,
  Grass
}

export enum ProcItemType {
  AppleTree,
  PineTree
}

export type ProcItemConf = {
  category: ProcItemCategory,
  params: any
}

type TreeGenerator = (xzProj: number, y: number, range: number) => BlockType

const AppleTreeGen = (xzProj: number, y: number, range: number): BlockType => {
  const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
  const isFoliage = dist <= range
  return isFoliage ? BlockType.TREE_FOLIAGE : BlockType.NONE
}

const PineTreeGen = (xzProj: number, y: number, range: number): BlockType => {
  const dist = xzProj // xzProj*(y+radius)
  const isFoliage = dist <= range * (1 - (0.35 * (y + range)) / range)
  return isFoliage ? BlockType.TREE_FOLIAGE_2 : BlockType.NONE
}

type ProceduralGenerator = TreeGenerator

const ProceduralGenerators: Record<ProcItemType, ProceduralGenerator> = {
  [ProcItemType.AppleTree]: AppleTreeGen,
  [ProcItemType.PineTree]: PineTreeGen
}

export class ProceduralItemGenerator {
  static chunkDataEncoder = (blockType: BlockType) => blockType

  static voxelizeItem(itemCat: ProcItemCategory, itemParams: any) {
    switch (itemCat) {
      case ProcItemCategory.Tree:
        const { treeType, treeSize, treeRadius } = itemParams
        return this.voxelizeTree(treeType, treeSize, treeRadius)
    }
  }

  static voxelizeTree(treeType: ProcItemType, treeSize: number, treeRadius: number) {
    const { chunkDataEncoder } = ProceduralItemGenerator
    const treeGenerator = ProceduralGenerators[treeType]
    const treeBounds = new Box3(new Vector3(), new Vector3(2 * treeRadius, treeSize + 2 * treeRadius, 2 * treeRadius))
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
          treeChunk.rawData[index++] = chunkDataEncoder(BlockType.NONE)
        } else {
          // tree foliage
          const blockType = treeGenerator(
            xzProj.length(),
            y - (min.y + treeSize + treeRadius),
            treeRadius,
          )
          treeChunk.rawData[index++] = chunkDataEncoder(blockType)
        }
      } else {
        // tree trunk
        treeChunk.rawData[index++] = chunkDataEncoder(BlockType.TREE_TRUNK)
      }
    }
    return treeChunk
  }

}