import { Box3, Vector2, Vector3 } from 'three'
import { getPatchPoints } from '../common/utils'
import { TreeType } from '../tools/TreeGenerator'
import { Biome, BlockType } from './Biome'
import { BlocksPatch, EntityChunk } from './BlocksPatch'
import { Heightmap } from './Heightmap'
import { EntityData, Vegetation } from './Vegetation'


export class PatchProcessing {
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
    const patchesStubs = this.inputKeys.map(patchOrigin=>new BlocksPatch(patchOrigin))
    for (const patch of patchesStubs) {
      asyncMode && (await new Promise(resolve => setTimeout(resolve, 0)))
      PatchProcessing.genGroundBlocks(patch)
      count++
      yield patch
    }

    elapsedTime = Date.now() - elapsedTime
    // const avgTime = Math.round(elapsedTime / count)
    // console.debug(
    //   `[BatchProcessing] processed ${count} patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
    // )
    this.elapsedTime += elapsedTime
    this.count += count
  }

  // genEntitiesBlocks(
  //   patch: BlocksPatch,
  //   entities: EntityData[],
  // ) {
  //   patch.entitiesChunks = entities.map(entity => {
  //     const blocksIter = patch.getBlocks(entity.bbox)
  //     // let item: BlockIteratorRes = blocksIter.next()
  //     const chunk: EntityChunk = {
  //       bbox: new Box3(),
  //       data: [],
  //     }

  //     for (const block of blocksIter) {
  //       const blocksBuffer = Vegetation.instance.fillBuffer(
  //         block.pos,
  //         entity,
  //         [],
  //       )
  //       patch.bbox.max.y = Math.max(
  //         patch.bbox.max.y,
  //         block.pos.y + blocksBuffer.length,
  //       )
  //       const serialized = blocksBuffer
  //         .reduce((str, val) => str + ',' + val, '')
  //         .slice(1)
  //       chunk.data.push(serialized)
  //       chunk.bbox.expandByPoint(block.pos)
  //     }
  //     patch.bbox.max.y = patch.bbox.max.y
  //     chunk.bbox = entity.bbox
  //     return chunk
  //   })
  // }

  /**
   * Gen blocks data that will be sent to blocks cache
   */
  static genGroundBlocks(patch: BlocksPatch) {
    const { min, max } = patch.bbox
    const patchId = min.x + ',' + min.z + '-' + max.x + ',' + max.z
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
      blockData.pos.y = Heightmap.instance.getGroundLevel(blockData.pos, rawVal, biomeContribs)
      blockData.type = blockTypes.grounds[0] as BlockType

      // let allowSpawn
      // if (blockTypes.entities?.[0]) {
      //   const ent = patch.spawnedEntities.find(entity => {
      //     const entityPos = entity.bbox.getCenter(new Vector3())
      //     return blockData.pos.distanceTo(entityPos) < 10
      //   })
      //   allowSpawn = !ent
      // }

      // const entity =
      //   allowSpawn && Vegetation.instance.spawnEntity(blockData.pos, prng)
      // if (entity) {
      //   entity.type = blockTypes.entities[0] as TreeType
      //   const entityPos = entity.bbox.getCenter(new Vector3())
      //   const entityHeight = 10
      //   entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
      //   // entity.bbox.min.y = Heightmap.instance.getGroundLevel(entityPos)
      //   entity.bbox.max.y = entity.bbox.min.y // + entityHeight
      //   // check if it has an overlap with edge patch(es)
      //   // e.g. check if current patch don't fully contain entity
      //   if (!patch.bbox.containsBox(entity.bbox)) {
      //     // find edge points that don't belongs to current patch
      //     const edgePoints = getPatchPoints(entity.bbox)
      //     entity.edgesOverlaps = edgePoints.filter(
      //       p => !patch.bbox.containsPoint(p),
      //     )
      //   }
      //   entity.bbox.max.y += entityHeight
      //   patch.spawnedEntities.push(entity)
      // }
      // const levelMax = blockData.cache.level + blockData.cache.overground.length
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
