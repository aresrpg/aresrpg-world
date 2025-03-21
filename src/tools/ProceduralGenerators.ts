import { Vector3, Vector2, Box3 } from 'three'

import { asVect2 } from '../utils/patch_chunk.js'
import { ChunkContainer } from '../datacontainers/ChunkContainer.js'
import { BlockType } from '../utils/common_types.js'

export enum ProcItemCategory {
  Tree,
  Boulder,
  Grass,
}

export enum ProcItemType {
  AppleTree,
  PineTree,
}

export type ProcItemConf = {
  category: ProcItemCategory
  params: any
}

type TreeGenerator = (xzProj: number, y: number, range: number) => BlockType

const AppleTreeGen = (xzProj: number, y: number, range: number): BlockType => {
  const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
  const isFoliage = dist <= range
  return isFoliage ? BlockType.FOLIAGE_LIGHT : BlockType.NONE
}

const PineTreeGen = (xzProj: number, y: number, range: number): BlockType => {
  const dist = xzProj // xzProj*(y+radius)
  const isFoliage = dist <= range * (1 - (0.35 * (y + range)) / range)
  return isFoliage ? BlockType.FOLIAGE_DARK : BlockType.NONE
}

type ProceduralGenerator = TreeGenerator

const ProceduralGenerators: Record<ProcItemType, ProceduralGenerator> = {
  [ProcItemType.AppleTree]: AppleTreeGen,
  [ProcItemType.PineTree]: PineTreeGen,
}

export class ProceduralItemGenerator {
  static voxelizeItem(itemCat: ProcItemCategory, itemParams: any) {
    const { treeType, treeSize, treeRadius } = itemParams
    switch (itemCat) {
      case ProcItemCategory.Tree:
        return this.voxelizeTree(treeType, treeSize, treeRadius)
    }
    return null
  }

  static voxelizeTree(
    treeType: ProcItemType,
    treeSize: number,
    treeRadius: number,
  ) {
    const treeGenerator = ProceduralGenerators[treeType]
    const treeBounds = new Box3(
      new Vector3(),
      new Vector3(2 * treeRadius, treeSize + 2 * treeRadius, 2 * treeRadius),
    )
    const treeChunk = new ChunkContainer(treeBounds)
    const entityPos = treeBounds.getCenter(new Vector3())
    let index = 0
    const chunkIter = treeChunk.iterateContent()
    for (const chunkBlock of chunkIter) {
      const { x, y, z } = chunkBlock.localPos
      const xzProj = new Vector2(x, z).sub(asVect2(entityPos))
      if (xzProj.length() > 0) {
        if (y < treeBounds.min.y + treeSize) {
          // empty space around trunk between ground and trunk top
          treeChunk.writeBlockData(index++, BlockType.NONE)
        } else {
          // tree foliage
          const blockType = treeGenerator(
            xzProj.length(),
            y - (treeBounds.min.y + treeSize + treeRadius),
            treeRadius,
          )
          treeChunk.writeBlockData(index++, blockType)
        }
      } else {
        // tree trunk
        treeChunk.writeBlockData(index++, BlockType.TRUNK)
      }
    }
    return treeChunk
  }
}
