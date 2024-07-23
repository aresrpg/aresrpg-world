import { Box3, Vector2, Vector3 } from 'three'

import { TreeGenerators, TreeType } from '../tools/TreeGenerator'

import { ProcLayer } from './ProcLayer'
import { BlockType } from './Biome'
import { BlocksPatch } from './BlocksPatch'
import PoissonDiskSampling from 'poisson-disk-sampling'

export type EntityData = {
  // xzProj: number
  level: number
  type: TreeType
  bbox: Box3
  edgesOverlaps?: any
  params: {
    radius: 5,
    size: 10,
  }
}

const default_bbox = new Box3(new Vector3(), new Vector3().addScalar(512))

/**
 * # EntitiesMap
 * performed in multiple steps
 * - spawn: add vegetation items
 * - prune: remove overlapping items at the edges
 * - gen: generate blocks above ground
 */
export class EntitiesMap {
  static mapsLookup: Record<string, EntitiesMap> = {}
  static density = new ProcLayer('entitiesmap')
  static repeatPeriod = 1
  mapCoords: Vector2
  entities: EntityData[] = []
  // eslint-disable-next-line no-use-before-define

  constructor(mapCoords: Vector2) {
    this.mapCoords = mapCoords
  }

  static populate() {
    const { repeatPeriod } = EntitiesMap
    const { patchSize } = BlocksPatch
    const mapRange = patchSize * repeatPeriod

    // init maps
    for (let cx = 0; cx < repeatPeriod; cx++) {
      for (let cy = 0; cy < repeatPeriod; cy++) {
        const mapKey = `map_${cx}_${cy}`
        const mapCoords = new Vector2(cx, cy)
        EntitiesMap.mapsLookup[mapKey] = EntitiesMap.mapsLookup[mapKey] || new EntitiesMap(mapCoords)
      }
    }

    // let count = 0
    // for (let x = 0; x < mapRange; x++) {
    //   for (let z = 0; z < mapRange; z++) {
    //     const pos = new Vector2(x, z)
    //     if (EntitiesMap.spawnEntity(pos)) {
    //       const mapKey = `map_${Math.floor(x / patchSize)}_${Math.floor(z / patchSize)}`
    //       const localPos = new Vector3(x % patchSize, 0, z % patchSize)
    //       const dimensions = new Vector3(10, 0, 10)
    //       const bbox = new Box3().setFromCenterAndSize(localPos, dimensions)
    //       const type = 'apple_tree'
    //       const entity: EntityData = {
    //         level: 0,
    //         type,
    //         bbox,
    //         params: {
    //           radius: 5,
    //           size: 10
    //         }
    //       }
    //       EntitiesMap.mapsLookup[mapKey]?.entities.push(entity)
    //       count++
    //     }
    //   }
    // }

    var p = new PoissonDiskSampling({
      shape: [mapRange, mapRange],
      minDistance: 15,
      maxDistance: 100,
      tries: 20,
      // distanceFunction: function (p) {
      //   return getImagePixelValueSomehow(p[0], p[1]); // value between 0 and 1
      // }
    });
    var points = p.fill();
    for (const point of points) {
      const pos = new Vector2(Math.round(point[0]), Math.round(point[1]))
      const mapKey = `map_${Math.floor(pos.x / patchSize)}_${Math.floor(pos.y / patchSize)}`
      const localPos = new Vector3(pos.x % patchSize, 0, pos.y % patchSize)
      const dimensions = new Vector3(10, 0, 10)
      const bbox = new Box3().setFromCenterAndSize(localPos, dimensions)
      const type = 'apple_tree'
      const entity: EntityData = {
        level: 0,
        type,
        bbox,
        params: {
          radius: 5,
          size: 10
        }
      }
      EntitiesMap.mapsLookup[mapKey]?.entities.push(entity)
    }
    console.log(points);
    // console.log(`entities count: ${count}`)
  }

  densityEval(pos: Vector3) {
    const val = EntitiesMap.density?.eval(pos)
    const adjustedVal = val ? 16 * Math.round(Math.exp((1 - val) * 10)) : 0
    return adjustedVal
  }

  mergeBuffers(srcBuffer: BlockType[], dstBuffer: BlockType[]) {
    // console.log(`merging buffers: `, srcBuffer, dstBuffer)
    const merged = []
    srcBuffer.reverse()
    dstBuffer.reverse()
    while (srcBuffer.length || dstBuffer.length) {
      const val = srcBuffer.pop() || dstBuffer.pop()
      merged.push(val)
    }
    // console.log(`result: `, merged)
    return merged
  }

  /**
   * All entities found at given block position
   */
  static queryBlockEntities(blockPos: Vector3) {
    const entities = []

    return entities
  }

  static *iterPatchEntities(patchCoords: Vector2) {
    const { repeatPeriod } = EntitiesMap
    const mapKey = `map_${patchCoords.x % repeatPeriod}_${patchCoords.y % repeatPeriod}`
    const map = EntitiesMap.mapsLookup[mapKey]
    // return entities in patch local coords
    for (const entity of map.entities) {
      yield entity
    }
  }

  /**
   * Using precached tree data and block level to fill tree blocks buffer
   * @param treeData
   * @param blockLevel
   * @param treeParams
   * @returns
   */
  static fillBlockBuffer(
    blockPos: Vector3,
    entity: EntityData,
    buffer: BlockType[],
  ) {
    // const { treeRadius, treeSize } = entity.params
    const treeRadius = 5
    const treeSize = 10
    const entityPos = entity.bbox.getCenter(new Vector3())
    entityPos.y = entity.bbox.min.y
    const treeBuffer: BlockType[] = []
    const vDiff = blockPos.clone().sub(entityPos)
    const offset = vDiff.y
    const count = treeSize - offset
    vDiff.y = 0
    const xzProj = vDiff.length()
    if (xzProj && count > 0) {
      // fill tree base
      new Array(count)
        .fill(BlockType.NONE)
        .forEach(item => treeBuffer.push(item))
      // tree foliage
      for (let y = -treeRadius; y < treeRadius; y++) {
        const blockType = TreeGenerators[entity.type as TreeType](
          xzProj,
          y,
          treeRadius,
        )
        treeBuffer.push(blockType)
      }
    } else {
      try {
        // a bit of an hack for now => TODO: find good fix
        new Array(count + treeRadius - Math.floor(treeSize * 0.4))
          .fill(BlockType.TREE_TRUNK)
          .forEach(item => treeBuffer.push(item))
      } catch (error) {
        // console.log(error)
      }
    }
    const sum = treeBuffer.reduce((sum, val) => sum + val, 0)
    if (sum > 0) {
      treeBuffer.forEach((elt, i) => {
        const current = buffer[i]
        if (current !== undefined) {
          buffer[i] = !buffer[i] ? elt : current
        } else {
          buffer.push(elt)
        }
      })
    }

    return sum > 0 ? treeBuffer : []
  }

  /**
   * Randomly spawn entites according to custom distribution
   */
  static spawnEntity(pos: Vector2) {
    // return Math.sin(0.01 * pos.x * pos.y) > 0.99
    const offset = 10
    return pos.x % 20 === offset && pos.y % 20 === offset
  }

}
