import { Box2, Box3, Vector2, Vector3 } from 'three'

import { ChunkFactory, EntityType, PseudoDistributionMap } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import {
  BlockData, BlocksPatchContainer,
} from '../datacontainers/BlocksPatch'
import { Block, EntityData, PatchKey } from '../common/types'
import { asBox2, asVect2, asVect3 } from '../common/utils'

// TODO remove hardcoded entity dimensions to compute from entity type
const entityDefaultDims = new Vector3(10, 20, 10)
// TODO move somewhere else
const defaultDistMap = new PseudoDistributionMap()
defaultDistMap.populate()

export const computePatch = (patchKey: PatchKey) => {
  const patch = new BlocksPatchContainer(patchKey)
  genGroundBlocks(patch)
  genEntities(patch)
  return patch
}

export const computeBlocksBatch = (
  blockPosBatch: Vector3[],
  params = { includeEntitiesBlocks: false },
) => {
  const blocksBatch = blockPosBatch.map(({ x, z }) => {
    const blockPos = new Vector3(x, 0, z)
    const blockData = computeGroundBlock(blockPos)
    if (params.includeEntitiesBlocks) {
      const blocksBuffer = computeBlocksBuffer(blockPos)
      const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
      if (lastBlockIndex >= 0) {
        blockData.level += lastBlockIndex
        blockData.type = blocksBuffer[lastBlockIndex] as BlockType
      }
    }
    blockPos.y = blockData.level
    const block: Block = {
      pos: blockPos,
      data: blockData,
    }
    return block
  })
  return blocksBatch
}

export const computeGroundBlock = (blockPos: Vector3) => {
  const biomeContribs = Biome.instance.getBiomeInfluence(blockPos)
  const mainBiome = Biome.instance.getMainBiome(biomeContribs)
  const rawVal = Heightmap.instance.getRawVal(blockPos)
  const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
  const level = Heightmap.instance.getGroundLevel(
    blockPos,
    rawVal,
    biomeContribs,
  )
  // const pos = new Vector3(blockPos.x, level, blockPos.z)
  const type = blockTypes.grounds[0] as BlockType
  // const entityType = blockTypes.entities?.[0] as EntityType
  // let offset = 0
  // if (lastBlock && entityType) {

  // }
  // level += offset
  const block: BlockData = { level, type }
  return block
}

const genEntity = (entityPos: Vector3) => {
  let entity: EntityData | undefined
  // use global coords in case entity center is from adjacent patch
  const rawVal = Heightmap.instance.getRawVal(entityPos)
  const mainBiome = Biome.instance.getMainBiome(entityPos)
  const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
  const entityType = blockTypes.entities?.[0] as EntityType
  if (entityType) {
    entityPos.y = Heightmap.instance.getGroundLevel(entityPos, rawVal) + entityDefaultDims.y / 2
    const entityBox = new Box3().setFromCenterAndSize(entityPos, entityDefaultDims)
    entity = {
      type: entityType,
      bbox: entityBox,
      params: {
        radius: 5,
        size: 10
      }
    }
  }
  return entity
}

export const computeBlocksBuffer = (blockPos: Vector3) => {
  let blocksBuffer
  // query entities at current block
  const entityShaper = (entityPos: Vector2) => new Box2().setFromCenterAndSize(entityPos, asVect2(entityDefaultDims))
  const mapPos = asVect2(blockPos)
  const mapItems = defaultDistMap.iterMapItems(entityShaper, mapPos)
  for (const mapPos of mapItems) {
    const entityPos = asVect3(mapPos)
    const entity = genEntity(entityPos)
    blocksBuffer = entity ? ChunkFactory.chunkifyEntity(entity, blockPos).data : blocksBuffer
  }
  return blocksBuffer || []
}

export const bakeEntities = (_entities: EntityData) => {
  // TODO
}

const genEntities = (blocksContainer: BlocksPatchContainer) => {
  // query entities on patch range
  const entityDims = new Vector3(10, 20, 10)  // TODO compute from entity type
  const entityShaper = (entityPos: Vector2) => new Box2().setFromCenterAndSize(entityPos, asVect2(entityDims))
  const mapBox = asBox2(blocksContainer.bbox)
  const entitiesIter = defaultDistMap.iterMapItems(entityShaper, mapBox)
  for (const mapPos of entitiesIter) {
    // use global coords in case entity center is from adjacent patch
    const entityPos = asVect3(mapPos)
    const entity = genEntity(entityPos)
    if (entity) {
      blocksContainer.entities.push(entity)
    }
  }
}

/**
 * Fill container with ground blocks
 */
const genGroundBlocks = (blocksContainer: BlocksPatchContainer) => {
  const { min, max } = blocksContainer.bbox
  // const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
  // const prng = alea(patchId)
  // const refPoints = this.isTransitionPatch ? this.buildRefPoints() : []
  // const blocksPatch = new PatchBlocksCache(new Vector2(min.x, min.z))
  const blocksPatchIter = blocksContainer.iterOverBlocks(undefined, false,)
  min.y = 512
  max.y = 0
  let blockIndex = 0
  for (const block of blocksPatchIter) {
    // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
    const blockData = computeGroundBlock(block.pos)
    min.y = Math.min(min.y, blockData.level)
    max.y = Math.max(max.y, blockData.level)
    blocksContainer.writeBlockData(blockIndex, blockData)
    blockIndex++
  }
  blocksContainer.bbox.min = min
  blocksContainer.bbox.max = max
  blocksContainer.bbox.getSize(blocksContainer.dimensions)
  // PatchBlocksCache.bbox.union(blocksContainer.bbox)

  // blocksContainer.state = PatchState.Filled
  return blocksContainer
}
