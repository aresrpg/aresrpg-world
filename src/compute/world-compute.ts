import { Box3, Vector3 } from 'three'

import { EntityType } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import {
  EntitiesMap,
  EntityData,
  RepeatableEntitiesMap,
} from '../procgen/EntitiesMap'
import {
  BlockData,
  BlocksContainer,
  BlocksPatch,
  EntityChunk,
} from '../data/DataContainers'
import { PatchKey } from '../common/types'

export const computePatch = (patchKey: PatchKey) => {
  const patch = new BlocksPatch(patchKey)
  genGroundBlocks(patch)
  genEntitiesBlocks(patch)
  return patch
}

export const computeBlocksBatch = (
  blockPosBatch: Vector3[],
  params = { includeEntitiesBlocks: false },
) => {
  const blocksBatch = blockPosBatch.map(({ x, z }) => {
    const block_pos = new Vector3(x, 0, z)
    const block = computeGroundBlock(block_pos)
    if (params.includeEntitiesBlocks) {
      const blocksBuffer = computeBlocksBuffer(block_pos)
      const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
      if (lastBlockIndex >= 0) {
        block.pos.y += lastBlockIndex
        block.type = blocksBuffer[lastBlockIndex] as BlockType
      }
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
  const pos = blockPos.clone()
  pos.y = level
  const block: BlockData = { pos, type }
  return block
}

export const computeBlocksBuffer = (blockPos: Vector3) => {
  let blocksBuffer: BlockType[] = []
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
      entity.bbox.max.y = entityLevel + 10
      entity.type = entityType
      blocksBuffer = EntitiesMap.fillBlockBuffer(blockPos, entity, blocksBuffer)
    }
  }
  return blocksBuffer
}

const buildEntityChunk = (patch: BlocksContainer, entity: EntityData) => {
  const entityChunk: EntityChunk = {
    bbox: new Box3(),
    data: [],
  }
  const blocksIter = patch.iterOverBlocks(entity.bbox, true)
  for (const block of blocksIter) {
    const blocksBuffer = EntitiesMap.fillBlockBuffer(block.pos, entity, [])
    patch.bbox.max.y = Math.max(
      patch.bbox.max.y,
      block.pos.y + blocksBuffer.length,
    )
    const serialized = blocksBuffer
      .reduce((str, val) => str + ',' + val, '')
      .slice(1)
    entityChunk.data.push(serialized)
    entityChunk.bbox.expandByPoint(block.pos)
  }
  entityChunk.bbox = entity.bbox
  return entityChunk
}

const genEntitiesBlocks = (blocksContainer: BlocksContainer) => {
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
      const dims = entity.bbox.getSize(new Vector3())
      dims.y = 10
      const localBmin = entity.bbox.min.clone().sub(blocksContainer.bbox.min)
      localBmin.y = Heightmap.instance.getGroundLevel(entityPos)
      const localBmax = localBmin.clone().add(dims)
      const localBbox = new Box3(localBmin, localBmax)
      entity.bbox = localBbox
      entity.type = entityType
      const entityChunk = buildEntityChunk(blocksContainer, entity)
      blocksContainer.entitiesChunks.push(entityChunk)
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
  const blocksPatchIter = blocksContainer.iterOverBlocks(
    undefined,
    false,
    false,
  )
  min.y = 512
  max.y = 0
  let blockIndex = 0

  for (const blockData of blocksPatchIter) {
    const blockPos = blockData.pos
    // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
    const block = computeGroundBlock(blockPos)
    min.y = Math.min(min.y, block.pos.y)
    max.y = Math.max(max.y, block.pos.y)
    // blocksContainer.writeBlockAtIndex(blockIndex, block.level, block.type)
    blocksContainer.writeBlockAtIndex(blockIndex, block.pos.y, block.type)
    blockIndex++
  }
  blocksContainer.bbox.min = min
  blocksContainer.bbox.max = max
  blocksContainer.bbox.getSize(blocksContainer.dimensions)
  // PatchBlocksCache.bbox.union(blocksContainer.bbox)

  // blocksContainer.state = PatchState.Filled
  return blocksContainer
}
