import { BlockType, EntityType } from '../index'

export type TreeGenerator = (
  xzProj: number,
  y: number,
  range: number,
) => BlockType

const AppleTreeGen = (xzProj: number, y: number, range: number) => {
  const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
  const isFoliage = dist <= range
  return isFoliage ? BlockType.TREE_FOLIAGE : BlockType.NONE
}

const PineTreeGen = (xzProj: number, y: number, range: number) => {
  const dist = xzProj // xzProj*(y+radius)
  const isFoliage = dist <= range * (1 - (0.35 * (y + range)) / range)
  return isFoliage ? BlockType.TREE_FOLIAGE_2 : BlockType.NONE
}

export const TreeGenerators: Record<EntityType, TreeGenerator> = {
  [EntityType.NONE]: () => BlockType.NONE,
  [EntityType.TREE_APPLE]: AppleTreeGen,
  [EntityType.TREE_PINE]: PineTreeGen,
}
