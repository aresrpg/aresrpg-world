import { Box3, Vector3 } from 'three'

import { EntityType } from '../index'
import { Biome, BlockType } from '../procgen/Biome'
import { Heightmap } from '../procgen/Heightmap'
import {
  EntitiesMap,
  EntityData,
  RepeatableEntitiesMap,
} from '../procgen/EntitiesMap'

import { BlocksPatch, EntityChunk } from './WorldPatch'

export class WorldCompute {
  static pendingTask = false
  startTime = Date.now()
  elapsedTime = 0
  count = 0

  // patch keys as input
  inputKeys: string[] = []
  // patch stubs as output
  outputStubs: BlocksPatch[] = []

  constructor(inputKeys: string[]) {
    this.inputKeys = inputKeys
  }

  static computeOvergroundBlocks(blockPos: Vector3) {
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
        blocksBuffer = EntitiesMap.fillBlockBuffer(
          blockPos,
          entity,
          blocksBuffer,
        )
      }
    }
    return blocksBuffer
  }

  static computeGroundBlock(blockPos: Vector3) {
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
    const block = { level, type }
    return block
  }

  static computeBlocksBatch(batchContent: [], includeEntities = true) {
    const batchRes = batchContent.map(({ x, z }) => {
      const block_pos = new Vector3(x, 0, z)
      const block = WorldCompute.computeGroundBlock(block_pos)
      if (includeEntities) {
        const blocksBuffer = WorldCompute.computeOvergroundBlocks(block_pos)
        const lastBlockIndex = blocksBuffer.findLastIndex(elt => elt)
        if (lastBlockIndex >= 0) {
          block.level += lastBlockIndex
          block.type = blocksBuffer[lastBlockIndex] as BlockType
        }
      }
      return block
    })
    return batchRes
  }

  static buildPatch(patchKey: string) {
    const patch = new BlocksPatch(patchKey)
    // asyncMode && (await new Promise(resolve => setTimeout(resolve, 0)))
    WorldCompute.buildGroundPatch(patch)
    WorldCompute.buildEntitiesChunks(patch)
    return patch
  }

  static buildEntityChunk(patch: BlocksPatch, entity: EntityData) {
    const entityChunk: EntityChunk = {
      bbox: new Box3(),
      data: [],
    }
    const blocksIter = patch.getBlocks(entity.bbox, true)
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

  static buildEntitiesChunks(patch: BlocksPatch) {
    const entitiesIter = RepeatableEntitiesMap.instance.iterate(patch.bbox)
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
        const localBmin = entity.bbox.min.clone().sub(patch.bbox.min)
        localBmin.y = Heightmap.instance.getGroundLevel(entityPos)
        const localBmax = localBmin.clone().add(dims)
        const localBbox = new Box3(localBmin, localBmax)
        entity.bbox = localBbox
        entity.type = entityType
        const entityChunk = WorldCompute.buildEntityChunk(patch, entity)
        patch.entitiesChunks.push(entityChunk)
        // let item: BlockIteratorRes = blocksIter.next()
      }
    }
  }

  /**
   * Gen blocks data that will be sent to blocks cache
   */
  static buildGroundPatch(patch: BlocksPatch) {
    const { min, max } = patch.bbox
    // const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
    // const prng = alea(patchId)
    // const refPoints = this.isTransitionPatch ? this.buildRefPoints() : []
    // const blocksPatch = new PatchBlocksCache(new Vector2(min.x, min.z))
    const blocksPatchIter = patch.iterBlocks()
    min.y = 512
    max.y = 0
    let blockIndex = 0

    for (const blockData of blocksPatchIter) {
      const blockPos = blockData.pos
      // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
      const block = this.computeGroundBlock(blockPos)
      min.y = Math.min(min.y, block.level)
      max.y = Math.max(max.y, block.level)
      patch.writeBlockAtIndex(blockIndex, block.level, block.type)
      blockIndex++
    }
    patch.bbox.min = min
    patch.bbox.max = max
    patch.bbox.getSize(patch.dimensions)
    // PatchBlocksCache.bbox.union(patch.bbox)

    // patch.state = PatchState.Filled
    return patch
  }
}
