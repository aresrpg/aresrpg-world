import { Box2, Box3, Vector2, Vector3 } from 'three'

import { ChunkFactory, EntityType, PseudoDistributionMap } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { BlockData, BlocksPatch } from '../datacontainers/BlocksPatch'
import { Block, EntityData, PatchKey } from '../common/types'
import { asBox2, asVect2, asVect3 } from '../common/utils'

// TODO remove hardcoded entity dimensions to compute from entity type
const entityDefaultDims = new Vector3(10, 20, 10)
// TODO move somewhere else
const distributionMap = new PseudoDistributionMap()

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

const genEntity = (entityPos: Vector3) => {
  let entity: EntityData | undefined
  // use global coords in case entity center is from adjacent patch
  const rawVal = Heightmap.instance.getRawVal(entityPos)
  const mainBiome = Biome.instance.getMainBiome(entityPos)
  const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
  const entityType = blockTypes.entities?.[0] as EntityType
  if (entityType) {
    entityPos.y =
      Heightmap.instance.getGroundLevel(entityPos, rawVal) +
      entityDefaultDims.y / 2
    const entityBox = new Box3().setFromCenterAndSize(
      entityPos,
      entityDefaultDims,
    )
    entity = {
      type: entityType,
      bbox: entityBox,
      params: {
        radius: 5,
        size: 10,
      },
    }
  }
  return entity
}

export const computeBlocksBuffer = (blockPos: Vector3) => {
  let blocksBuffer
  // query entities at current block
  const entityShaper = (entityPos: Vector2) =>
    new Box2().setFromCenterAndSize(entityPos, asVect2(entityDefaultDims))
  const mapPos = asVect2(blockPos)
  const spawnLocs = distributionMap.getSpawnLocations(entityShaper, mapPos)
  for (const loc of spawnLocs) {
    const entityPos = asVect3(loc)
    const entity = genEntity(entityPos)
    blocksBuffer = entity
      ? ChunkFactory.chunkifyEntity(entity, blockPos).data
      : blocksBuffer
  }
  return blocksBuffer || []
}

// export const bakeEntities = (_entities: EntityData) => {
//   // TODO
// }

const genEntities = (blocksPatch: BlocksPatch) => {
  // query entities on patch range
  const entityDims = new Vector3(10, 20, 10) // TODO compute from entity type
  const entityShaper = (entityPos: Vector2) =>
    new Box2().setFromCenterAndSize(entityPos, asVect2(entityDims))
  const mapBox = asBox2(blocksPatch.bbox)
  const spawnLocs = distributionMap.getSpawnLocations(entityShaper, mapBox)
  const spawnedEntities = spawnLocs
    .map(loc => asVect3(loc))
    .map(entityPos => genEntity(entityPos))
    .filter(val => val) as EntityData[]
  blocksPatch.entities = spawnedEntities
}

/**
 * Fill container with ground blocks
 */
const genGroundBlocks = (blocksPatch: BlocksPatch) => {
  const { min, max } = blocksPatch.bbox
  // const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
  // const prng = alea(patchId)
  // const refPoints = this.isTransitionPatch ? this.buildRefPoints() : []
  // const blocksPatch = new PatchBlocksCache(new Vector2(min.x, min.z))
  const patchBlocks = blocksPatch.iterOverBlocks(undefined, false)
  min.y = 512
  max.y = 0
  let blockIndex = 0
  for (const block of patchBlocks) {
    // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
    const blockData = computeGroundBlock(block.pos)
    min.y = Math.min(min.y, blockData.level)
    max.y = Math.max(max.y, blockData.level)
    blocksPatch.writeBlockData(blockIndex, blockData)
    blockIndex++
  }
  blocksPatch.bbox.min = min
  blocksPatch.bbox.max = max
  blocksPatch.bbox.getSize(blocksPatch.dimensions)
  // PatchBlocksCache.bbox.union(blocksPatch.bbox)

  // blocksPatch.state = PatchState.Filled
  return blocksPatch
}
