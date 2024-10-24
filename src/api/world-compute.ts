import { Box2, Vector2, Vector3 } from 'three'

import {
  GroundPatch,
  ItemsInventory,
  PseudoDistributionMap,
  WorldConf,
} from '../index'
import { Biome, BiomeInfluence, BiomeType, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import {
  Block,
  BlockData,
  GroundBlock,
  LandscapesConf,
  PatchBoundId,
  PatchKey,
} from '../common/types'
import {
  asVect2,
  asVect3,
  bilinearInterpolation,
  getPatchBoundingPoints,
  getPatchId,
  serializePatchId,
} from '../common/utils'
import { ItemType } from '../misc/ItemsInventory'
import {
  DistributionProfile,
  DistributionProfiles,
} from '../datacontainers/RandomDistributionMap'
import { DistributionParams } from '../procgen/BlueNoisePattern'

type PatchBoundingBiomes = Record<PatchBoundId, BiomeInfluence>

const defaultDistribution: DistributionParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}
const defaultSpawnMap = new PseudoDistributionMap(
  undefined,
  defaultDistribution,
)
const defaultItemDims = new Vector3(10, 13, 10)

/**
 * Brain of the world runnable in separate worker
 * Support for:
 * - individual blocks request (batch)
 * - ground layer request (patch)
 * - overground items (patch)
 */

/**
 * Common
 */

const getBiomeBoundsInfluences = (bounds: Box2) => {
  const { xMyM, xMyP, xPyM, xPyP } = PatchBoundId
  // eval biome at patch corners
  const equals = (v1: BiomeInfluence, v2: BiomeInfluence) => {
    const different = Object.keys(v1)
      // .map(k => parseInt(k) as BiomeType)
      .find(k => v1[k as BiomeType] !== v2[k as BiomeType])
    return !different
  }
  const boundsPoints = getPatchBoundingPoints(bounds)
  const boundsInfluences = {} as PatchBoundingBiomes
  ;[xMyM, xMyP, xPyM, xPyP].map(key => {
    const boundPos = boundsPoints[key] as Vector2
    const biomeInfluence = Biome.instance.getBiomeInfluence(asVect3(boundPos))
    boundsInfluences[key] = biomeInfluence
    // const block = computeGroundBlock(asVect3(pos), biomeInfluence)
    return biomeInfluence
  })
  const allEquals =
    equals(boundsInfluences[xMyM], boundsInfluences[xPyM]) &&
    equals(boundsInfluences[xMyM], boundsInfluences[xMyP]) &&
    equals(boundsInfluences[xMyM], boundsInfluences[xPyP])
  return allEquals ? boundsInfluences[xMyM] : boundsInfluences
}

const getBlockBiome = (
  blockPos: Vector2,
  patchBounds: Box2,
  boundingBiomes: BiomeInfluence | PatchBoundingBiomes,
) => {
  if (
    (boundingBiomes as PatchBoundingBiomes)[PatchBoundId.xMyM] &&
    WorldConf.settings.useBiomeBilinearInterpolation
  ) {
    return bilinearInterpolation(
      blockPos,
      patchBounds,
      boundingBiomes as PatchBoundingBiomes,
    ) as BiomeInfluence
  }
  return boundingBiomes as BiomeInfluence
}

export const computeGroundBlock = (
  blockPos: Vector3,
  biomeInfluence?: BiomeInfluence,
) => {
  biomeInfluence = biomeInfluence || Biome.instance.getBiomeInfluence(blockPos)
  // const biomeInfluenceBis = Biome.instance.getBiomeInfluence(blockPos)
  const biomeType = Biome.instance.getBiomeType(biomeInfluence)
  const rawVal = Heightmap.instance.getRawVal(blockPos)
  const nominalConf = Biome.instance.getBiomeConf(
    rawVal,
    biomeType,
  ) as LandscapesConf
  // const confIndex = Biome.instance.getConfIndex(currLevelConf.key)
  // const confData = Biome.instance.indexedConf.get(confIndex)
  const level = Heightmap.instance.getGroundLevel(
    blockPos,
    rawVal,
    biomeInfluence,
  )
  let usedConf = nominalConf
  if (nominalConf.next?.data) {
    const variation = Biome.instance.posRandomizer.eval(
      blockPos.clone().multiplyScalar(50),
    )
    const min = new Vector2(nominalConf.data.x, nominalConf.data.y)
    const max = new Vector2(nominalConf.next.data.x, nominalConf.next.data.y)
    const rangeBox = new Box2(min, max)
    const dims = rangeBox.getSize(new Vector2())
    // const slope = dims.y / dims.x
    const distRatio = (rawVal - min.x) / dims.x
    const threshold = 4 * distRatio
    usedConf =
      variation > threshold && nominalConf.prev?.data.type
        ? nominalConf.prev
        : nominalConf
  }

  if (isNaN(usedConf.data.type)) {
    console.log(nominalConf.data)
  }

  // }
  // level += offset
  const output = { level, type: usedConf.data.type, confKey: usedConf.data.key }
  return output
}

/**
 * Ground blocks
 */

/**
 *
 * @param blockPosBatch
 * @param params
 * @returns
 */
export const computeBlocksBatch = async (
  blockPosBatch: Vector2[],
  params = { includeEntitiesBlocks: false },
) => {
  // sort blocks by patch
  const blocksByPatch: Record<PatchKey, GroundBlock[]> = {}
  const blocksBatch = blockPosBatch.map(pos => {
    const patchKey = serializePatchId(
      getPatchId(pos, WorldConf.regularPatchDimensions),
    )
    const data: BlockData = {
      level: 0,
      type: BlockType.NONE,
    }
    const block: Block<BlockData> = {
      pos: asVect3(pos),
      data,
    }
    blocksByPatch[patchKey] = blocksByPatch[patchKey] || []
    blocksByPatch[patchKey]?.push(block as any)
    return block
  })
  for await (const [patchKey, patchBlocks] of Object.entries(blocksByPatch)) {
    const groundPatch = new GroundPatch(patchKey)
    const biomeBoundsInfluences = getBiomeBoundsInfluences(groundPatch.bounds)
    for await (const block of patchBlocks) {
      const blockBiome = getBlockBiome(
        asVect2(block.pos),
        groundPatch.bounds,
        biomeBoundsInfluences,
      )
      block.data = computeGroundBlock(block.pos, blockBiome)
      // const {level, type } =
      // override with last block if specified
      if (params.includeEntitiesBlocks) {
        const lastBlockData = await queryLastBlockData(asVect2(block.pos))
        block.data =
          lastBlockData.level > 0 && lastBlockData.type
            ? lastBlockData
            : block.data
      }
      block.pos.y = block.data.level
    }
  }

  // const blocksBatch = blockPosBatch.map((pos) => {
  //   const blockPos = asVect3(pos)
  //   const blockData = computeGroundBlock(blockPos)
  //   const { spawnableItems } = blockData
  //   const queriedLoc = new Box2().setFromPoints([asVect2(blockPos)])
  //   queriedLoc.max.addScalar(1)
  //   false && includeEntitiesBlocks && spawnableItems.forEach(itemType => {
  //     // several (overlapping) objects may be found at queried position
  //     const [spawnedEntity] = ItemsInventory.querySpawnedEntities(itemType, queriedLoc)
  //     const lastBlockIndex = blocksBuffer?.findLastIndex(elt => elt)
  //     if (blocksBuffer && lastBlockIndex && lastBlockIndex >= 0) {
  //       blockData.level += lastBlockIndex
  //       blockData.type = blocksBuffer[lastBlockIndex] as BlockType
  //     }
  //   })
  //   blockPos.y = blockData.level
  //   const block: Block = {
  //     pos: blockPos,
  //     data: blockData,
  //   }
  //   return block
  // })
  return blocksBatch as GroundBlock[]
}

/**
 * Ground patch
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
  const biomeBoundsInfluences = getBiomeBoundsInfluences(groundPatch.bounds)
  const blocks = groundPatch.iterBlocksQuery(undefined, false)
  const valueRange = {
    min: 512,
    max: 0,
  }
  let blockIndex = 0
  for (const block of blocks) {
    // EXPERIMENTAL: is it faster to perform bilinear interpolation rather
    // than sampling biome for each block?
    // if biome is the same at each patch corners, no need to interpolate
    const blockBiome = getBlockBiome(
      asVect2(block.pos),
      groundPatch.bounds,
      biomeBoundsInfluences,
    )
    const blockData = computeGroundBlock(block.pos, blockBiome)
    valueRange.min = Math.min(valueRange.min, blockData.level)
    valueRange.max = Math.max(valueRange.max, blockData.level)
    groundPatch.writeBlockData(blockIndex, blockData)
    blockIndex++
  }
  return groundPatch
}

/**
 * Overground patch (items)
 */
export const retrieveOvergroundItems = async (bounds: Box2) => {
  const boundsBiomeInfluences = getBiomeBoundsInfluences(bounds)

  const spawnedItems: Record<ItemType, Vector3[]> = {}
  const spawnPlaces = defaultSpawnMap.querySpawnLocations(
    bounds,
    asVect2(defaultItemDims),
  )
  for (const pos of spawnPlaces) {
    const blockBiome = getBlockBiome(pos, bounds, boundsBiomeInfluences)
    const { confKey, level } = computeGroundBlock(asVect3(pos), blockBiome)
    const weightedItems = Biome.instance.indexedConf.get(confKey)?.data?.flora
    if (weightedItems) {
      const spawnableTypes: ItemType[] = []
      Object.entries(weightedItems).forEach(([itemType, spawnWeight]) => {
        while (spawnWeight > 0) {
          spawnableTypes.push(itemType)
          spawnWeight--
        }
      })
      const itemType = defaultSpawnMap.getSpawnedItem(
        pos,
        spawnableTypes,
      ) as ItemType
      if (itemType) {
        spawnedItems[itemType] = spawnedItems[itemType] || []
        spawnedItems[itemType]?.push(asVect3(pos, level))
      }
    }
  }
  return spawnedItems
}

export const queryLastBlockData = async (queriedLoc: Vector2) => {
  const lastBlockData: BlockData = {
    level: 0,
    type: 0,
  }
  const spawnPlaces = defaultSpawnMap.querySpawnLocations(
    queriedLoc,
    asVect2(defaultItemDims),
  )
  for await (const spawnOrigin of spawnPlaces) {
    const patchKey = serializePatchId(
      getPatchId(spawnOrigin, WorldConf.regularPatchDimensions),
    )
    const groundPatch = new GroundPatch(patchKey)
    const biomeBoundsInfluences = getBiomeBoundsInfluences(groundPatch.bounds)
    const blockBiome = getBlockBiome(
      spawnOrigin,
      groundPatch.bounds,
      biomeBoundsInfluences,
    )
    const { confKey, level } = computeGroundBlock(
      asVect3(spawnOrigin),
      blockBiome,
    )
    const spawnableTypes = Biome.instance.indexedConf.get(confKey)?.data?.flora
    const spawnableItems: ItemType[] = []
    for (const entry of Object.entries(spawnableTypes || {})) {
      const [itemType] = entry
      let [, spawnWeight] = entry
      while (spawnWeight > 0) {
        spawnableItems.push(itemType)
        spawnWeight--
      }
    }
    const itemType = defaultSpawnMap.getSpawnedItem(
      spawnOrigin,
      spawnableItems,
    ) as ItemType
    if (itemType && spawnOrigin) {
      const itemChunk = await ItemsInventory.getInstancedChunk(
        itemType,
        asVect3(spawnOrigin),
      )
      if (itemChunk) {
        // const halfDims = itemTemplateChunk.bounds.getSize(new Vector3()).divideScalar(2)
        // const chunkOrigin = spawnOrigin.clone().sub(asVect2(halfDims)).round()
        // const localCenter = spawnOrigin.clone().sub(chunkOrigin)
        const localCenter = itemChunk.toLocalPos(asVect3(spawnOrigin))
        const blocksBuffer = itemChunk.readBuffer(asVect2(localCenter))
        // find last block in buffer and override block level accordingly
        let lastIndex = blocksBuffer ? blocksBuffer.length - 1 : 0
        while (lastIndex > 0 && !blocksBuffer[lastIndex]) lastIndex--
        const lastLevel = level + lastIndex
        const type = blocksBuffer?.[lastIndex]
        if (type && lastLevel > lastBlockData.level) {
          lastBlockData.level = lastLevel
          lastBlockData.type = type as BlockType
        }
      }
    }
  }
  return lastBlockData
}

// Battle board
// export const computeBoardData = (boardPos: Vector3, boardParams: BoardInputParams, lastBoardBounds: Box2) => {
//   const boardMap = new BoardContainer(boardPos, boardParams, lastBoardBounds)
//   await boardMap.fillGroundData()
//   await boardMap.populateEntities()
//   const boardStub = boardMap.toStub()
//   return boardStub
// }
