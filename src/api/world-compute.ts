import { Box2, Vector2, Vector3 } from 'three'

import { BoardContainer, EntityType, GroundPatch } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { BlockData } from '../datacontainers/BlocksPatch'
import { Block, EntityData, PatchKey } from '../common/types'
import { asBox3, asVect2, asVect3 } from '../common/utils'
import { WorldEntities } from '../procgen/WorldEntities'
import { EntityChunk, EntityChunkMaker } from '../datacontainers/EntityChunkMaker'
/**
 * BLOCKS
 */

/**
 * 
 * @param blockPosBatch 
 * @param params 
 * @returns 
 */
export const computeBlocksBatch = (
  blockPosBatch: Vector3[],
  params = { includeEntitiesBlocks: false },
) => {
  const { includeEntitiesBlocks } = params
  const blocksBatch = blockPosBatch.map(({ x, z }) => {
    const blockPos = new Vector3(x, 0, z)
    const blockData = computeGroundBlock(blockPos)
    if (includeEntitiesBlocks) {
      const entityRange = new Box2().setFromPoints([asVect2(blockPos)])
      entityRange.max.addScalar(1)
      const foundEntity = queryEntities(entityRange)
        .map(entityData => new EntityChunkMaker(entityData))[0]
      let blocksBuffer
      if (foundEntity) {
        const { min, max } = foundEntity.entityData.bbox
        const voxelizationRange = asBox3(entityRange)
        voxelizationRange.min.y = min.y
        voxelizationRange.max.y = max.y
        blocksBuffer = foundEntity.voxelizeEntity(voxelizationRange)
      }
      const lastBlockIndex = blocksBuffer?.findLastIndex(elt => elt)
      if (blocksBuffer && lastBlockIndex && lastBlockIndex >= 0) {
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

/**
 * PATCHES
 */

export const bakeGroundPatch = (patchKeyOrBox: PatchKey | Box2) => {
  const groundPatch = new GroundPatch(patchKeyOrBox)
  groundPatch.fill()
  return groundPatch
}

export const computeBoardData = (center: Vector3, radius: number, maxThickness: number) => {
  const boardMap = new BoardContainer(center, radius, maxThickness)
  const boardGroundBlocks = bakeGroundPatch(boardMap.bbox)
}

/**
 * ENTITIES
 */

export const bakeEntities = (queriedRange: Box2) => {
  const entitiesData = queryEntities(queriedRange)
  return bakeEntitiesBatch(entitiesData)
}

export const bakeEntitiesBatch = (entities: EntityData[]) => {
  const entitiesChunks: EntityChunk[] = entities
    .map(entityData => new EntityChunkMaker(entityData))
    .map(entityChunkMaker => {
      entityChunkMaker.voxelizeEntity()
      return entityChunkMaker.toStub() as EntityChunk
    })
  return entitiesChunks
}


/**
 * 
 * @param entityPos 
 * @returns 
 */
const confirmFinalizeEntity = (entity: EntityData) => {
  const entityPos = entity.bbox.getCenter(new Vector3)
  // use global coords in case entity center is from adjacent patch
  const rawVal = Heightmap.instance.getRawVal(entityPos)
  const mainBiome = Biome.instance.getMainBiome(entityPos)
  const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
  const entityType = blockTypes.entities?.[0] as EntityType
  // confirm this kind of entity can spawn over here
  if (entityType) {
    entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos, rawVal)
    entity.bbox.max.y += entity.bbox.min.y
    return entity
  }
  return
}

const queryEntities = (region: Box2 | Vector2) => {
  const spawnablePlaces = WorldEntities.instance.queryDistributionMap(EntityType.TREE_APPLE)(region)
  const spawnedEntities = spawnablePlaces
    .map(entLoc => WorldEntities.instance.getEntityData(EntityType.TREE_PINE, asVect3(entLoc)))
    .filter(entity => confirmFinalizeEntity(entity))
  return spawnedEntities
}

// /**
//  * return all entity types which can spwawn over specific region
//  */
// const getSpawnableEntities = (region: Box2) => {
//   // TODO
// }

// /**
//  * granular check in transition place (spline or biome transitions)
//  */
// const confirmSpawnability = () => {

// }
