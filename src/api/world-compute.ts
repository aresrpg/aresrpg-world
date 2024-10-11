import { Box2, Vector2, Vector3 } from 'three'
import { GroundPatch, ItemsInventory, PseudoDistributionMap, WorldConf } from '../index'
import { Biome, BiomeInfluence, BiomeType, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import { Block, NoiseLevelConf, PatchBoundId, PatchKey } from '../common/types'
import { asVect2, asVect3, bilinearInterpolation, getPatchBoundingPoints, getPatchId, serializePatchId } from '../common/utils'
import { ItemType } from '../misc/ItemsInventory'

type PatchBoundingBiomes = Record<PatchBoundId, BiomeInfluence>

/**
 * Brain of the world runnable in separate worker
 * Support for:
 * - individual blocks request (batch)
 * - ground layer request (patch)
 * - overground items (patch)
 */

/**
 *
 * @param blockPosBatch
 * @param params
 * @returns
 */
export const computeBlocksBatch = (
  blockPosBatch: Vector2[],
  params = { includeEntitiesBlocks: false },
) => {
  const { includeEntitiesBlocks } = params
  // sort blocks by patch
  const blocksByPatch: Record<PatchKey, Vector2[]> = {

  }
  blockPosBatch.forEach(pos => {
    const patchKey = serializePatchId(getPatchId(pos, WorldConf.regularPatchDimensions))
    blocksByPatch[patchKey] = blocksByPatch[patchKey] || []
    blocksByPatch[patchKey]?.push(pos)
  })
  Object.entries(blocksByPatch).forEach(([patchKey, patchBlocks]) => {

  })
  const blocksBatch = blockPosBatch.map(({ x, z }) => {
    const blockPos = new Vector3(x, 0, z)
    const blockData = computeGroundBlock(blockPos)
    const { spawnableItems } = blockData
    const queriedLoc = new Box2().setFromPoints([asVect2(blockPos)])
    queriedLoc.max.addScalar(1)
    false && includeEntitiesBlocks && spawnableItems.forEach(itemType => {
      // several (overlapping) objects may be found at queried position
      const [spawnedEntity] = ItemsInventory.querySpawnedEntities(itemType, queriedLoc)

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
  // const confIndex = Biome.instance.getConfIndex(currLevelConf.key)
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

const getBiomeBoundsInfluences = (bounds: Box2) => {
  const { xMyM, xMyP, xPyM, xPyP } = PatchBoundId
  // eval biome at patch corners
  const equals = (v1: BiomeInfluence, v2: BiomeInfluence) => {
    const different = Object.keys(v1).find(k => v1[k as BiomeType] !== v2[k as BiomeType])
    return !different
  }
  const boundsPoints = getPatchBoundingPoints(bounds)
  const boundsInfluences = {} as PatchBoundingBiomes
  [xMyM, xMyP, xPyM, xPyP].map(key => {
    const boundPos = boundsPoints[key] as Vector2
    const biomeInfluence = Biome.instance.getBiomeInfluence(boundPos)
    boundsInfluences[key] = biomeInfluence
    // const block = computeGroundBlock(asVect3(pos), biomeInfluence)
    return biomeInfluence
  })
  const allEquals = equals(boundsInfluences[xMyM], boundsInfluences[xPyM])
    && equals(boundsInfluences[xMyM], boundsInfluences[xMyP])
    && equals(boundsInfluences[xMyM], boundsInfluences[xPyP])
  return allEquals ? boundsInfluences[xMyM] : boundsInfluences
}

const getBlockBiome = (blockPos: Vector2, patchBounds: Box2, boundingBiomes: BiomeInfluence | PatchBoundingBiomes) => {
  if ((boundingBiomes as PatchBoundingBiomes)[PatchBoundId.xMyM] && WorldConf.settings.useBiomeBilinearInterpolation) {
    return bilinearInterpolation(blockPos, patchBounds, boundingBiomes as PatchBoundingBiomes)
  }
}

// Patch ground layer
export const bakeGroundLayer = (boundsOrPatchKey: PatchKey | Box2) => {
  const groundPatch = new GroundPatch(boundsOrPatchKey)
  const biomeBoundsInfluences = getBiomeBoundsInfluences(groundPatch.bounds)
  const { min, max } = groundPatch.bounds
  const blocks = groundPatch.iterBlocksQuery(undefined, false)
  const level = {
    min: 512,
    max: 0,
  }
  let blockIndex = 0
  for (const block of blocks) {
    // EXPERIMENTAL: is it faster to perform bilinear interpolation rather than sampling biome for each block?

    // if biome is the same at each patch corners, no need to interpolate
    const blockData = computeGroundBlock(block.pos, getBlockBiome(asVect2(block.pos), groundPatch.bounds, biomeBoundsInfluences))
    level.min = Math.min(min.y, blockData.level)
    level.max = Math.max(max.y, blockData.level)
    groundPatch.writeBlockData(blockIndex, blockData)
    groundPatch.blockConfigs[blockData.confKey] = true
    blockIndex++
  }
  return groundPatch
}

export const retrieveOvergroundItems = async (bounds: Box2) => {
  // spawnable items based on soil type found in this specific region
  const blockConfigs: any = {}
  const patchBoundingPoints = getPatchBoundingPoints(bounds);
  // eval configs at each patch corners
  Object.values(patchBoundingPoints).forEach(pos => {
    const block = computeGroundBlock(asVect3(pos))
    blockConfigs[block.confKey] = Biome.instance.indexedConf.get(block.confKey)?.data
  })
const itemsSpawnMap = new PseudoDistributionMap()
  const itemsWeightedList: ItemType[] = []
  const itemDims = new Vector3(10, 13, 10)
  Object.values(blockConfigs).forEach((blockConf: NoiseLevelConf) => {
    // blockConf?.entities?.forEach(itemType => {
    //   spawnedItems[itemType] = []
    // })
    Object.entries(blockConf.flora || {}).forEach(([itemType, itemWeight]) => {
      // build weighted items array
      while (itemWeight > 0) {
        itemsWeightedList.push(itemType)
        itemWeight--
      }
    })
  })
  const spawnedItems = itemsSpawnMap.querySpawnedItems(bounds, asVect2(itemDims), itemsWeightedList)
  const confirmedItems: Record<ItemType, Vector3[]> = {}
  Object.entries(spawnedItems)
    .forEach(([itemType, itemSpawnLocs]) => {
      itemSpawnLocs.map(itemPos => {
        const itemBlock = computeGroundBlock(asVect3(itemPos))
        // confirm entities and add spawn elevation
        const blockConf = Biome.instance.indexedConf.get(itemBlock.confKey)?.data
        if (blockConf?.flora)//find(val => val === itemType))
        {
          confirmedItems[itemType] = confirmedItems[itemType] || [];
          (confirmedItems[itemType] as Vector3[]).push(asVect3(itemPos, itemBlock.level))
        }
      })
    })
  return confirmedItems
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
