import { Box2, Vector2, Vector3 } from 'three'

import { EntityType, GroundPatch } from '../index'
import { Biome, BiomeInfluence, BiomeType, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { Block, EntityData, NoiseLevelConf, PatchKey } from '../common/types'
import { asBox3, asVect2, asVect3, bilinearInterpolation, getBoundsCornerPoints } from '../common/utils'
import { BlockData } from '../datacontainers/GroundPatch'
import { OvergroundEntities, WorldObjectType } from '../datacontainers/OvergroundEntities'
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
    const { spawnableItems } = blockData
    const queriedLoc = new Box2().setFromPoints([asVect2(blockPos)])
    queriedLoc.max.addScalar(1)
    false && includeEntitiesBlocks && spawnableItems.forEach(entityType => {
      // multiple (overlapping) objects may be found at queried position
      const [spawnedEntity] = OvergroundEntities.querySpawnedEntities(entityType, queriedLoc)

      // const [foundEntity] = queryEntities(spawnRange).map(entityData => {
      //   const { min, max } = entityData.bbox
      //   const custChunkBox = asBox3(entityRange)
      //   custChunkBox.min.y = min.y
      //   custChunkBox.max.y = max.y
      //   return new EntityChunk(entityData, custChunkBox)
      // })
      // foundEntity.
      const lastBlockIndex = blocksBuffer?.findLastIndex(elt => elt)
      if (blocksBuffer && lastBlockIndex && lastBlockIndex >= 0) {
        blockData.level += lastBlockIndex
        blockData.type = blocksBuffer[lastBlockIndex] as BlockType
      }
    })
    blockPos.y = blockData.level
    const block: Block = {
      pos: blockPos,
      data: blockData,
    }
    return block
  })
  return blocksBatch
}

export const computeGroundBlock = (blockPos: Vector3, biomeInfluence: BiomeInfluence) => {
  biomeInfluence = biomeInfluence || Biome.instance.getBiomeInfluence(blockPos)
  // const biomeInfluenceBis = Biome.instance.getBiomeInfluence(blockPos)
  const biomeType = Biome.instance.getBiomeType(biomeInfluence)
  const rawVal = Heightmap.instance.getRawVal(blockPos)
  const noiseLevel = Biome.instance.getBiomeConf(rawVal, biomeType) as NoiseLevelConf
  const currLevelConf = noiseLevel.data
  const prevLevelConf = noiseLevel.prev?.data
  const nextLevelConf = noiseLevel.next?.data
  const confIndex = Biome.instance.getConfIndex(currLevelConf.key)
  // const confData = Biome.instance.indexedConf.get(confIndex)
  const level = Heightmap.instance.getGroundLevel(
    blockPos,
    rawVal,
    biomeInfluence,
  )
  // const pos = new Vector3(blockPos.x, level, blockPos.z)
  const variation = Biome.instance.posRandomizer.eval(blockPos.clone().multiplyScalar(50))//Math.cos(0.1 * blockPos.length()) / 100
  const min = new Vector2(currLevelConf.x, currLevelConf.y)
  const max = new Vector2(nextLevelConf.x, nextLevelConf.y)
  const rangeBox = new Box2(min, max)
  const dims = rangeBox.getSize(new Vector2())
  const slope = dims.y / dims.x
  const distRatio = (rawVal - min.x) / dims.x
  const threshold = 4 * distRatio
  const prevType = prevLevelConf?.type
  const type = variation > threshold && prevType ? prevType : currLevelConf.type
  if (!type) {
    console.log(currLevelConf)
  }
  const spawnableItems = currLevelConf.entities
  // const entityType = blockTypes.entities?.[0] as EntityType
  // let offset = 0
  // if (lastBlock && entityType) {

  // }
  // level += offset
  const block: BlockData = { level, type, spawnableItems }
  return block
}

/**
 * Patch requests
 */

// Patch ground layer
export const bakeGroundPatch = (boundsOrPatchKey: PatchKey | Box2) => {
  const groundPatch = new GroundPatch(boundsOrPatchKey)
  // eval biome at patch corners
  const equals = (v1, v2) => {
    const different = Object.keys(v1).find(k => v1[k] !== v2[k])
    return !different
  }
  const [p11, p12, p21, p22] = getBoundsCornerPoints(groundPatch.bounds)
  const [v11, v12, v21, v22] = [p11, p12, p21, p22].map(point => Biome.instance.getBiomeInfluence(point))
  const allEquals = equals(v11, v12) && equals(v11, v21) && equals(v11, v22)
  const { min, max } = groundPatch.bounds
  const blocks = groundPatch.iterBlocksQuery(undefined, false)
  const level = {
    min: 512,
    max: 0,
  }
  let blockIndex = 0
  for (const block of blocks) {
    // if biome is the same at each patch corners, no need tp interpolate
    const interpolatedBiome = allEquals ? v11 : bilinearInterpolation(asVect2(block.pos), groundPatch.bounds, { v11, v12, v21, v22 })
    const blockData = computeGroundBlock(block.pos, interpolatedBiome)
    level.min = Math.min(min.y, blockData.level)
    level.max = Math.max(max.y, blockData.level)
    groundPatch.writeBlockData(blockIndex, blockData)
    blockIndex++
  }
  return groundPatch
}

/**
 * patch is an assembly of several layers
 * - ground
 * - underground caverns
 * - overground objects
 */
export const bakePatchLayers = () => { }
export const bakePatchGroundLayer = () => { }
export const bakePatchUndergroundLayer = () => { } // or caverns
export const bakePatchOvergroundLayer = (boundsOrPatchKey: PatchKey | Box2, objectType: WorldObjectType) => { }


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

export const queryEntities = (queriedRegion: Box2, queriedObjType: WorldObjectType) => {
  const queriedObject = OvergroundObjects.getObjectInstance(queriedObjType)

  // const spawnablePlaces = queriedObject.queryDistribution(queriedRegion)
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
  const biomeType = Biome.instance.getBiomeType(entityPos)
  const biomeConf = Biome.instance.getBiomeConf(rawVal, biomeType)
  const [entityType] = biomeConf.data.entities || []
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
  // const entitiesChunks: EntityChunkStub[] = entities
  //   .map(entityData => new EntityChunk(entityData))
  //   .map(entityChunk => {
  //     entityChunk.voxelize()
  //     return entityChunk.toStub()
  //   })
  return [];//entitiesChunks
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
