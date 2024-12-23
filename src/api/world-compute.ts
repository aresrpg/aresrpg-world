import { Box3, Vector2, Vector3 } from 'three'

import {
  DensityVolume,
  ItemsInventory,
  PseudoDistributionMap,
  WorldEnv,
} from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import {
  BlockData,
  ChunkId,
  ChunkKey,
  PatchId,
  PatchKey,
} from '../utils/types'
import {
  asBox2,
  asVect2,
  asVect3,
  getPatchId,
  serializeChunkId,
  serializePatchId,
} from '../utils/convert'
import { ItemsChunkLayer, ItemType } from '../processing/ItemsInventory'
import {
  DistributionProfile,
  DistributionProfiles,
} from '../processing/RandomDistributionMap'
import { DistributionParams } from '../procgen/BlueNoisePattern'
import { GroundPatch } from '../processing/GroundPatch'
import {
  ChunkContainer,
  ChunkMask,
  defaultDataEncoder,
} from '../datacontainers/ChunkContainer'
import { GroundChunk } from '../processing/ChunkFactory'

const defaultDistribution: DistributionParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}
const defaultSpawnMap = new PseudoDistributionMap(
  undefined,
  defaultDistribution,
)
const defaultItemDims = new Vector3(10, 13, 10)


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
      getPatchId(spawnOrigin, WorldEnv.current.patchDimensions),
    )
    const groundPatch = new GroundPatch(patchKey)
    groundPatch.preprocess()
    const { level, biome, landscapeIndex } = groundPatch.computeGroundBlock(asVect3(spawnOrigin))
    const spawnableTypes =
      Biome.instance.mappings[biome]?.nth(landscapeIndex)?.data?.flora
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

/**
 * Ground surface + overground items
 * @param patchKey
 */
export const bakeSurfaceChunkset = async (patchKey: PatchKey) => {
  const itemsLayer = new ItemsChunkLayer(patchKey)
  await itemsLayer.process()
  const itemsMergedChunk = itemsLayer.mergeIndividualChunks()
  const groundLayer = new GroundPatch(patchKey)
  groundLayer.bake()
  const patchId = groundLayer.patchId as PatchId
  const surfaceChunks: ChunkContainer[] = []
  // compute chunk id range
  const { patchDimensions } = WorldEnv.current
  const yMin = Math.min(
    itemsMergedChunk.bounds.min.y,
    groundLayer.valueRange.min,
  )
  const yMax = Math.max(
    itemsMergedChunk.bounds.max.y,
    groundLayer.valueRange.max,
  )
  const yMinId = Math.floor(yMin / patchDimensions.y)
  const yMaxId = Math.floor(yMax / patchDimensions.y)
  // gen each surface chunk in range
  for (let yId = yMinId; yId <= yMaxId; yId++) {
    const chunkId = asVect3(patchId, yId)
    const chunkKey = serializeChunkId(chunkId)
    const worldChunk = new ChunkContainer(chunkKey, 1)
    // copy items layer first to prevent overriding ground
    ChunkContainer.copySourceToTarget(itemsMergedChunk, worldChunk)
    if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
      // bake ground and undeground separately
      const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
      const cavesMask = await bakeCavesMask(chunkKey)
      await groundSurfaceChunk.bake(groundLayer, cavesMask)
      // copy ground over items at last
      ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
    }
    surfaceChunks.push(worldChunk)
  }
  return surfaceChunks
}

/**
 *
 * @param patchOrChunkId either patchId to discover top underground chunk or specific underground chunkId
 * @returns top underground chunk or specified underground chunk
 */
export const bakeUndergroundChunk = async (
  patchOrChunkId: PatchId | ChunkId,
  genParams = { noEncoder: false },
) => {
  const patchId =
    patchOrChunkId instanceof Vector2 ? patchOrChunkId : asVect2(patchOrChunkId)
  const groundLayer = new GroundPatch(serializePatchId(patchId))
  groundLayer.bake()
  const topId =
    Math.floor(
      groundLayer.valueRange.min / WorldEnv.current.patchDimensions.y,
    ) - 1
  const chunkKey = serializeChunkId(
    patchOrChunkId instanceof Vector3
      ? patchOrChunkId
      : asVect3(patchId, topId),
  )
  const worldChunk = new ChunkContainer(chunkKey, 1)
  const customEncoder = genParams.noEncoder ? defaultDataEncoder : undefined
  const groundSurfaceChunk = new GroundChunk(chunkKey, 1, customEncoder)
  const cavesMask = await bakeCavesMask(chunkKey)
  await groundSurfaceChunk.bake(groundLayer, cavesMask)
  // copy ground over items at last
  ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
  // }
  return worldChunk
}

// export const bakeUndegroundChunkset = async (patchKey: PatchKey) => {
//   const { patchDimensions } = WorldEnv.current
//   const itemsChunkLayer = await bakeOvergroundChunk(patchKey)
//   const groundLayer = bakeGroundLayer(patchKey)
//   const { yMinId } = WorldEnv.current.chunks.genRange
//   const yMaxId = Math.floor(groundLayer.valueRange.min / patchDimensions.y) - 1
//   const patchId = groundLayer.patchId as PatchId
//   const undergroundChunks: ChunkContainer[] = []
//   for (let yId = yMinId; yId <= yMaxId; yId++) {
//     const chunkId = asVect3(patchId, yId)
//     const chunkKey = serializeChunkId(chunkId)
//     const worldChunk = new ChunkContainer(chunkKey, 1)
//     // copy items layer first
//     ChunkContainer.copySourceToTarget(itemsChunkLayer, worldChunk)
//     if (worldChunk.bounds.min.y < groundLayer.valueRange.max) {
//       // bake ground and undeground separately
//       const groundSurfaceChunk = new GroundChunk(chunkKey, 1)
//       const cavesMask = await bakeCavesMask(chunkKey)
//       await groundSurfaceChunk.bake(groundLayer, cavesMask)
//       // copy ground over items at last
//       ChunkContainer.copySourceToTarget(groundSurfaceChunk, worldChunk)
//     }
//     undergroundChunks.push(worldChunk)
//   }
//   return undergroundChunks
// }

/**
 * Underground chunk (caverns)
 */

export const bakeCavesMask = (boundsOrPatchKey: ChunkKey | Box3) => {
  const chunkContainer = new ChunkMask(boundsOrPatchKey, 1)
  const chunkBounds = chunkContainer.bounds
  const groundLayer = new GroundPatch(asBox2(chunkBounds))
  groundLayer.bake()
  // const bounds = asBox3(groundLayer.bounds)
  // bounds.max.y = groundLayer.valueRange.max
  // const chunkContainer = new ChunkContainer(bounds, 1)
  // chunkContainer.rawData.fill(0)
  const patchIter = groundLayer.iterBlocksQuery(undefined, false)
  for (const block of patchIter) {
    // const buffPos = asVect2(block.localPos)
    // const chunkBuff = chunkContainer.readBuffer(buffPos)
    const groundLevel = block.pos.y
    const ymin = chunkContainer.extendedBounds.min.y
    const ymax = Math.min(groundLevel, chunkContainer.extendedBounds.max.y)
    const startLocalPos = new Vector3(block.localPos.x, -1, block.localPos.z)
    let startIndex = chunkContainer.getIndex(startLocalPos)
    for (let y = ymin; y <= ymax; y++) {
      block.pos.y = y
      const isEmptyBlock = DensityVolume.instance.getBlockDensity(
        block.pos,
        groundLevel + 20,
      )
      chunkContainer.rawData[startIndex++] = isEmptyBlock ? 0 : 1
    }
    // chunkContainer.writeBuffer(buffPos, chunkBuff)
  }
  // const chunkIter = chunkContainer.iterateContent(undefined, false)
  // for (const block of chunkIter) {
  //   const isEmptyBlock = DensityVolume.instance.getBlockType(block.pos, bounds.max.y) === BlockType.NONE
  //   chunkContainer.writeSector(block.pos, isEmptyBlock ? 0 : 1)
  // }
  return chunkContainer
}

// Battle board
// export const computeBoardData = (boardPos: Vector3, boardParams: BoardInputParams, lastBoardBounds: Box2) => {
//   const boardMap = new BoardContainer(boardPos, boardParams, lastBoardBounds)
//   await boardMap.fillGroundData()
//   await boardMap.populateEntities()
//   const boardStub = boardMap.toStub()
//   return boardStub
// }
export enum ComputeTask {
  BakeSurfaceChunks = 'bakeSurfaceChunks',
  BakeUndergroundChunk = 'bakeUndergroundChunk',
  BakeCavesMask = 'bakeCavesMask',
  // BakeUpperChunks = 'bakeUpperChunks', // empty, overground and surface
  // BakeLowerChunks = 'bakeLowerChunks', // undeground
  // BattleBoardCompute = 'computeBoardData',
}

export const WorldComputeApi: Record<ComputeTask, any> = {
  [ComputeTask.BakeSurfaceChunks]: bakeSurfaceChunkset,
  [ComputeTask.BakeUndergroundChunk]: bakeUndergroundChunk,
  [ComputeTask.BakeCavesMask]: bakeCavesMask,
}
