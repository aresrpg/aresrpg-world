import { Box2, Vector2, Vector3 } from 'three'

import { EntityType, GroundPatch, WorldConf } from '../index'
import { Biome, BiomeInfluence, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { BiomeConfKey, Block, EntityData, NoiseLevelConf, PatchKey } from '../common/types'
import { asVect2, asVect3, bilinearInterpolation, getBoundsCornerPoints } from '../common/utils'
import { BlockConfigs, BlockData } from '../datacontainers/GroundPatch'
import { OvergroundEntities, WorldItem } from '../datacontainers/OvergroundEntities'
// import { BoardInputParams } from '../feats/BoardContainer'

/**
 * Brain of the world which can be run in separate worker
 */

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

export const computeGroundBlock = (blockPos: Vector3, biomeInfluence?: BiomeInfluence) => {
  biomeInfluence = biomeInfluence || Biome.instance.getBiomeInfluence(blockPos)
  // const biomeInfluenceBis = Biome.instance.getBiomeInfluence(blockPos)
  const biomeType = Biome.instance.getBiomeType(biomeInfluence)
  const rawVal = Heightmap.instance.getRawVal(blockPos)
  const noiseLevel = Biome.instance.getBiomeConf(rawVal, biomeType) as NoiseLevelConf
  const currLevelConf = noiseLevel.data
  const prevLevelConf = noiseLevel.prev?.data
  const nextLevelConf = noiseLevel.next?.data
  const confKey = currLevelConf.key
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
  const output = { level, type, spawnableItems, confKey }
  return output
}

/**
 * Patch requests
 */

export const bakePatch = (boundsOrPatchKey: PatchKey | Box2) => {
  // compute patch layers
  const groundLayer = bakeGroundLayer(boundsOrPatchKey)
  // const overgroundItems = retrieveOvergroundItems(groundLayer.bounds)
  // console.log(overgroundItems)
  return groundLayer
}

// Patch ground layer
export const bakeGroundLayer = (boundsOrPatchKey: PatchKey | Box2) => {
  const groundPatch = new GroundPatch(boundsOrPatchKey)
  // eval biome at patch corners
  const equals = (v1, v2) => {
    const different = Object.keys(v1).find(k => v1[k] !== v2[k])
    return !different
  }
  const [p11, p12, p21, p22] = getBoundsCornerPoints(groundPatch.bounds)
  const [v11, v12, v21, v22] = [p11, p12, p21, p22].map(pos => {
    const biomeInfluence = Biome.instance.getBiomeInfluence(pos)
    // const block = computeGroundBlock(asVect3(pos), biomeInfluence)
    return biomeInfluence
  })
  const allEquals = equals(v11, v12) && equals(v11, v21) && equals(v11, v22)
  const { min, max } = groundPatch.bounds
  const blocks = groundPatch.iterBlocksQuery(undefined, false)
  const level = {
    min: 512,
    max: 0,
  }
  let blockIndex = 0
  for (const block of blocks) {
    // EXPERIMENTAL: is it faster to perform bilinear interpolation rather than sampling biome for each block?
    const getBlockBiome = () => WorldConf.settings.useBiomeBilinearInterpolation && bilinearInterpolation(asVect2(block.pos), groundPatch.bounds, { v11, v12, v21, v22 })
    // if biome is the same at each patch corners, no need to interpolate
    const blockData = computeGroundBlock(block.pos, allEquals ? v11 : getBlockBiome())
    level.min = Math.min(min.y, blockData.level)
    level.max = Math.max(max.y, blockData.level)
    groundPatch.writeBlockData(blockIndex, blockData)
    groundPatch.blockConfigs[blockData.confKey] = true
    blockIndex++
  }
  return groundPatch
}

export const retrieveOvergroundItems = (bounds: Box2) => {
  // spawnable items based on soil type found in this specific region
  const blockConfigs: any = {}
  const [p11, p12, p21, p22] = getBoundsCornerPoints(bounds);
  [p11, p12, p21, p22].forEach(pos => {
    const block = computeGroundBlock(asVect3(pos))
    blockConfigs[block.confKey] = Biome.instance.indexedConf.get(block.confKey)?.data
  })
  const spawnedItems = {}
  Object.values(blockConfigs).forEach(blockConf => blockConf?.entities?.forEach(itemType => spawnedItems[itemType] = []))
  Object.keys(spawnedItems).forEach(type => {
    const itemType = parseInt(type) as WorldItem
    const spawnablePlaces = OvergroundEntities.querySpawnedEntities(
      itemType,
      bounds,
    )
    spawnablePlaces.forEach(itemPos => {
      // confirm entities and add spawn elevation
      const block = computeGroundBlock(asVect3(itemPos))
      const blockConf = Biome.instance.indexedConf.get(block.confKey)?.data
      if (blockConf?.entities?.find(val => val === itemType))
        spawnedItems[itemType].push(asVect3(itemPos, block.level))
    })
  })
  return spawnedItems
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
export const bakePatchOvergroundLayer = (boundsOrPatchKey: PatchKey | Box2, itemType: WorldItem) => { }


// Battle board
// export const computeBoardData = (boardPos: Vector3, boardParams: BoardInputParams, lastBoardBounds: Box2) => {
//   const boardMap = new BoardContainer(boardPos, boardParams, lastBoardBounds)
//   await boardMap.fillGroundData()
//   await boardMap.populateEntities()
//   const boardStub = boardMap.toStub()
//   return boardStub
// }
