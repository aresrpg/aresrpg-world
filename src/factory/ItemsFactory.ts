import {Box3, Vector3 } from 'three'

import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators'
import { SchematicLoader } from '../tools/SchematicLoader'

import { WorldEnv } from '../config/WorldEnv'

export type ItemType = string
export type SpawnedItems = Record<ItemType, Vector3[]>

/**
 * Referencing all items either procedurally generated or coming from schematic definitions 
 */
// rename as ItemsFactory ?
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
      const customBlocksMapping =
        WorldEnv.current.schematics.localBlocksMapping[id]
      chunk = await SchematicLoader.createChunkContainer(
        fileUrl,
        customBlocksMapping,
      )
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