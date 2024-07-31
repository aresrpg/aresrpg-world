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

  async *iterBatch(asyncMode = false) {
    let count = 0
    let elapsedTime = Date.now()
    const patchesStubs = this.inputKeys.map(
      patchOrigin => new BlocksPatch(patchOrigin),
    )
    for (const patch of patchesStubs) {
      asyncMode && (await new Promise(resolve => setTimeout(resolve, 0)))
      WorldCompute.buildGroundPatch(patch)
      WorldCompute.buildEntitiesChunks(patch)
      count++
      yield patch
    }

    elapsedTime = Date.now() - elapsedTime
    // const avgTime = Math.round(elapsedTime / count)
    // console.debug(
    //   `[WorldCompute] processed ${count} patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
    // )
    this.elapsedTime += elapsedTime
    this.count += count
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
      blockData.pos.y = 0
      // const patchCorner = points.find(pt => pt.distanceTo(blockData.pos) < 2)
      const biomeContribs = Biome.instance.getBiomeInfluence(blockData.pos)
      const mainBiome = Biome.instance.getMainBiome(biomeContribs)
      const rawVal = Heightmap.instance.getRawVal(blockData.pos)
      const blockTypes = Biome.instance.getBlockType(rawVal, mainBiome)
      blockData.pos.y = Heightmap.instance.getGroundLevel(
        blockData.pos,
        rawVal,
        biomeContribs,
      )
      blockData.type = blockTypes.grounds[0] as BlockType
      min.y = Math.min(min.y, blockData.pos.y)
      max.y = Math.max(max.y, blockData.pos.y)
      patch.writeBlockAtIndex(blockIndex, blockData.pos.y, blockData.type)
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
