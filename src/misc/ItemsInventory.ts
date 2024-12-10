import { Box2, Box3, Vector3 } from 'three'

import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { WorldComputeProxy } from '../index'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators'
import { SchematicLoader } from '../tools/SchematicLoader'
import { asPatchBounds, asBox3, asBox2 } from '../utils/common'
import { PatchKey } from '../utils/types'
import { WorldEnv } from './WorldEnv'

export type ItemType = string
export type SpawnedItems = Record<ItemType, Vector3[]>

/**
 * Referencing  all items generated from procedural or external schematic templates
 */
// TODO rename class in ItemsChunksFactory
export class ItemsInventory {
  // TODO rename catalog as inventory
  static catalog: Record<ItemType, ChunkContainer> = {}
  static get externalSources() {
    const schematicsFilesIndex = WorldEnv.current.schematics.filesIndex
    const proceduralItemsConfigs = WorldEnv.current.proceduralItems.configs
    return { schematicsFilesIndex, proceduralItemsConfigs }
  }
  static get schematicFilesIndex() {
    return WorldEnv.current.schematics.filesIndex
  }
  static get proceduralItemsConf() {
    return WorldEnv.current.proceduralItems.configs
  }
  // static spawners: Record<ItemType, PseudoDistributionMap> = {}
  /**
   * Populate from schematics
   * @param schematicFileUrls
   * @param optionalDataEncoder
   */
  static async importSchematic(id: ItemType) {
    const fileUrl = ItemsInventory.schematicFilesIndex[id]
    let chunk
    if (fileUrl) {
      chunk = await SchematicLoader.createChunkContainer(fileUrl)
      // const spawner = new PseudoDistributionMap()
      ItemsInventory.catalog[id] = chunk
    }
    return chunk
  }

  static importProcItem(id: ItemType) {
    const procConf = ItemsInventory.proceduralItemsConf[id]
    let chunk
    if (procConf) {
      chunk = ProceduralItemGenerator.voxelizeItem(
        procConf.category,
        procConf.params,
      )
      // const spawner = new PseudoDistributionMap()
      if (chunk) {
        ItemsInventory.catalog[id] = chunk
      }
    }
    return chunk
  }

  static async getTemplateChunk(itemId: string) {
    return (
      this.catalog[itemId] ||
      (await this.importSchematic(itemId)) ||
      this.importProcItem(itemId)
    )
  }

  static async getInstancedChunk(itemType: ItemType, itemPos: Vector3) {
    let itemChunk: ChunkContainer | undefined
    const templateChunk = await this.getTemplateChunk(itemType)
    if (templateChunk) {
      const dims = templateChunk.bounds.getSize(new Vector3())
      // const translation = parseThreeStub(spawnLoc).sub(new Vector3(dims.x / 2, 0, dims.z / 2).round())
      // const entityBounds = entity.template.bounds.clone().translate(translation)
      const entityBounds = new Box3().setFromCenterAndSize(itemPos, dims)
      entityBounds.min.y = itemPos.y
      entityBounds.max.y = itemPos.y + dims.y
      entityBounds.min.floor()
      entityBounds.max.floor()
      itemChunk = new ChunkContainer(entityBounds, 0)
      itemChunk.rawData.set(templateChunk.rawData)
    }
    return itemChunk
  }
}

export class ItemsChunkLayer {
  bounds: Box3
  spawnedItems: SpawnedItems = {}
  individualChunks: ChunkContainer[] = []

  constructor(boundsOrPatchKey: Box2 | PatchKey) {
    const patchBounds =
      boundsOrPatchKey instanceof Box2
        ? boundsOrPatchKey.clone()
        : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
    this.bounds = asBox3(patchBounds)
  }

  get spawnedLocs() {
    const spawnedLocs = []
    for (const [, spawnPlaces] of Object.entries(this.spawnedItems)) {
      spawnedLocs.push(...spawnPlaces)
    }
    return spawnedLocs
  }

  async populate() {
    this.spawnedItems = await WorldComputeProxy.current.queryOvergroundItems(asBox2(this.bounds))
    this.individualChunks = await this.bakeIndividualChunks()
  }

  async bake() {
    const patchBounds = asBox2(this.bounds)
    const mergedChunkStub = await WorldComputeProxy.current.bakeItemsChunkLayer(patchBounds)
    // const chunkBounds = asBox3(patchBounds, mergedChunkStub.bounds.min.y, mergedChunkStub.bounds.max.y)
    // this.adjustChunkBounds(chunkBounds)
    // ChunkContainer.copySourceToTarget(mergedChunkStub, this)
    // this.rawData.set(mergedChunkStub.rawData)
    // this.fromStub(mergedChunkStub)
  }

  async bakeIndividualChunks() {
    // request all items belonging to this patch
    const individualChunks = []
    let ymin = NaN, ymax = NaN  // compute y range
    for await (const [itemType, spawnPlaces] of Object.entries(this.spawnedItems)) {
      for await (const spawnOrigin of spawnPlaces) {
        const itemChunk = await ItemsInventory.getInstancedChunk(
          itemType,
          spawnOrigin,
        )
        if (itemChunk) {
          // ChunkContainer.copySourceToTarget(itemChunk, this)
          const { min, max } = itemChunk.bounds
          ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
          ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
          individualChunks.push(itemChunk)
        }
      }
    }
    this.bounds.min.y = ymin
    this.bounds.max.y = ymax
    return individualChunks
  }

  mergeIndividualChunks() {
    const mergedChunkLayer = new ChunkContainer(this.bounds, 1)


  }
}
