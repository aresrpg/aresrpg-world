import { Box2, Vector3 } from 'three'

import { EntityType, GroundPatch } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { Block, EntityData, PatchKey } from '../common/types'
import { asBox3, asVect2, asVect3 } from '../common/utils'
import { WorldEntities } from '../procgen/WorldEntities'
import { EntityChunk, EntityChunkStub } from '../datacontainers/EntityChunk'
import { BlockData } from '../datacontainers/GroundPatch'
// import { BoardInputParams } from '../feats/BoardContainer'

/**
 * Individual blocks requests
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
      const [foundEntity] = queryEntities(entityRange).map(entityData => {
        const { min, max } = entityData.bbox
        const custChunkBox = asBox3(entityRange)
        custChunkBox.min.y = min.y
        custChunkBox.max.y = max.y
        return new EntityChunk(entityData, custChunkBox)
      })
      const blocksBuffer = foundEntity?.voxelize()
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
 * Patch requests
 */

// Ground
export const bakeGroundPatch = (boundsOrPatchKey: PatchKey | Box2) => {
  const groundPatch = new GroundPatch(boundsOrPatchKey)
  const { min, max } = groundPatch.bounds
  const blocks = groundPatch.iterBlocksQuery(undefined, false)
  const level = {
    min: 512,
    max: 0,
  }
  let blockIndex = 0
  for (const block of blocks) {
    const blockData = computeGroundBlock(block.pos)
    level.min = Math.min(min.y, blockData.level)
    level.max = Math.max(max.y, blockData.level)
    groundPatch.writeBlockData(blockIndex, blockData)
    blockIndex++
  }
  return groundPatch
}

// Battle board
// export const computeBoardData = (boardPos: Vector3, boardParams: BoardInputParams, lastBoardBounds: Box2) => {
//   const boardMap = new BoardContainer(boardPos, boardParams, lastBoardBounds)
//   await boardMap.fillGroundData()
//   await boardMap.populateEntities()
//   const boardStub = boardMap.toStub()
//   return boardStub
// }

/**
 * Entity queries/baking
 */

export const queryEntities = (queriedRegion: Box2) => {
  const spawnablePlaces = WorldEntities.instance.queryDistributionMap(
    EntityType.TREE_APPLE,
  )(queriedRegion)
  const spawnedEntities = spawnablePlaces
    .map(entLoc =>
      WorldEntities.instance.getEntityData(
        EntityType.TREE_PINE,
        asVect3(entLoc),
      ),
    )
    .filter(entity => confirmFinalizeEntity(entity))
  return spawnedEntities
}

/**
 *
 * @param entityPos
 * @returns
 */
const confirmFinalizeEntity = (entity: EntityData) => {
  const entityPos = entity.bbox.getCenter(new Vector3())
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
  return null
}

export const queryBakeEntities = (queriedRange: Box2) => {
  const entitiesData = queryEntities(queriedRange)
  return bakeEntitiesBatch(entitiesData)
}

export const bakeEntitiesBatch = (entities: EntityData[]) => {
  const entitiesChunks: EntityChunkStub[] = entities
    .map(entityData => new EntityChunk(entityData))
    .map(entityChunk => {
      entityChunk.voxelize()
      return entityChunk.toStub()
    })
  return entitiesChunks
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
