import { Box3, Vector3 } from 'three'

import { ChunkContainer } from '../datacontainers/ChunkContainer.js'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { ItemType } from '../utils/common_types.js'
import { worldRootEnv } from '../config/WorldEnv.js'
// import { asVect2 } from '../utils/patch_chunk'

/**
 * Referencing all items either procedurally generated or coming from schematic definitions
 */
// rename as ItemsFactory ?
export class ItemsInventory {
  // TODO rename catalog as inventory
  static catalog: Record<ItemType, ChunkContainer> = {}
  static get externalSources() {
    const schematicsFilesIndex = worldRootEnv.rawSettings.schematics.filesIndex
    const proceduralItemsConfigs =
      worldRootEnv.rawSettings.proceduralItems.configs
    return { schematicsFilesIndex, proceduralItemsConfigs }
  }

  static get schematicFilesIndex() {
    return worldRootEnv.rawSettings.schematics.filesIndex
  }

  static get proceduralItemsConf() {
    return worldRootEnv.rawSettings.proceduralItems.configs
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
        worldRootEnv.rawSettings.schematics.localBlocksMapping[id]
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

  static getOffsetBounds(origin: Vector3, dims: Vector3) {
    const bmin = origin.clone()
    const bmax = origin.clone().add(dims)
    const offsetBounds = new Box3(bmin, bmax)
    return offsetBounds
  }

  static getCenteredBounds(origin: Vector3, dims: Vector3) {
    const centeredBounds = new Box3().setFromCenterAndSize(origin, dims)
    centeredBounds.min.y = origin.y
    centeredBounds.max.y = origin.y + dims.y
    centeredBounds.min.floor()
    centeredBounds.max.floor()
    return centeredBounds
  }

  static async getInstancedChunk(
    itemType: ItemType,
    itemPos: Vector3,
    originCentered = true,
    shallowInstance = false,
  ) {
    let itemChunk: ChunkContainer | undefined
    const templateChunk = await this.getTemplateChunk(itemType)
    if (templateChunk) {
      const itemDims = templateChunk.bounds.getSize(new Vector3())
      const itemBounds = originCentered
        ? this.getCenteredBounds(itemPos, itemDims)
        : this.getOffsetBounds(itemPos, itemDims)
      // itemChunk = new ChunkContainer(entityBounds, 0)
      itemChunk = new ChunkContainer(itemBounds, 0)
      if (!shallowInstance) {
        itemChunk.rawData.set(templateChunk.rawData)
      }
    }
    return itemChunk
  }

  // static async getSliceSectorBlocks(
  //   itemType: ItemType,
  //   centerPos: Vector3,
  //   requestedPos: Vector3,
  // ) {
  //   const templateChunk = await this.getTemplateChunk(itemType)
  //   const shallowInstance = await this.getInstancedChunk(
  //     itemType,
  //     centerPos,
  //     true,
  //     true,
  //   )

  //   let sliceSectorData
  //   if (templateChunk && shallowInstance) {
  //     const localPos = shallowInstance.toLocalPos(requestedPos)
  //     sliceSectorData = templateChunk.readBuffer(asVect2(localPos))
  //     // const sliceSectors = templateChunk.iterChunkSlice(location)
  //     // for (const sliceSector of sliceSectors) {
  //     //   sliceSectorData = sliceSector.data
  //     // }
  //   }
  //   return sliceSectorData
  // }
}
