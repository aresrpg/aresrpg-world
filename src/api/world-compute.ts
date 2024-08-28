import { Vector3 } from 'three'

import { ChunkFactory, EntityType } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import {
  EntityData,
  RepeatableEntitiesMap,
} from '../procgen/EntitiesMap'
import {
  BlockData,
  BlocksContainer,
  BlocksPatch,
} from '../data/DataContainers'
import { Block, PatchKey } from '../common/types'

export const computePatch = (patchKey: PatchKey) => {
  const patch = new BlocksPatch(patchKey)
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

export const computeBlocksBuffer = (blockPos: Vector3) => {
  let blocksBuffer
  // query entities at current block
  const entitiesIter = RepeatableEntitiesMap.instance.iterate(blockPos)
  for (const entity of entitiesIter) {
    // use global coords in case entity center is from adjacent patch
    const entityPos = entity.bbox.getCenter(new Vector3())
    const rawVal = Heightmap.instance.getRawVal(entityPos)
    const mainBiome = Biome.instance.getMainBiome(entityPos)
    const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
    const entityType = blockTypes.entities?.[0] as EntityType
    if (entityType) {
      const entityLevel = Heightmap.instance.getGroundLevel(entityPos, rawVal)
      entity.bbox.min.y = entityLevel
      entity.bbox.max.y = entityLevel + 20
      entity.type = entityType
      blocksBuffer = ChunkFactory.chunkifyEntity(entity, blockPos).data
    }
  }
  return blocksBuffer || []
}

export const bakeEntities = (_entities: EntityData) => {
  // TODO
}

const genEntities = (blocksContainer: BlocksContainer) => {
  const entitiesIter = RepeatableEntitiesMap.instance.iterate(
    blocksContainer.bbox,
  )
  for (const entity of entitiesIter) {
    // use global coords in case entity center is from adjacent patch
    const entityPos = entity.bbox.getCenter(new Vector3())
    const biome = Biome.instance.getMainBiome(entityPos)
    const rawVal = Heightmap.instance.getRawVal(entityPos)
    const blockTypes = Biome.instance.getBlockType(rawVal, biome)
    const entityType = blockTypes.entities?.[0] as EntityType
    // const patchLocalBmin = new Vector3(min.x % patch.dimensions.x + min.x >= 0 ? 0 : patch.dimensions.x,
    //   0,
    //   max.z % patch.dimensions.z + max.z >= 0 ? 0 : patch.dimensions.z)
    if (entityType) {
      entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
      entity.bbox.max.y = entity.bbox.min.y + 20
      entity.type = entityType
      blocksContainer.entities.push(entity)
      // const entityChunk = buildEntityChunk(blocksContainer, entity)
      // blocksContainer.entitiesChunks.push(entityChunk)
      // let item: BlockIteratorRes = blocksIter.next()
    }
  }
}

/**
 * Fill container with ground blocks
 */
const genGroundBlocks = (blocksContainer: BlocksContainer) => {
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
