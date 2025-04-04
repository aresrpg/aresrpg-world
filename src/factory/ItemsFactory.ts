import { Vector2 } from 'three'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { ItemType, VoidItemType } from '../utils/common_types.js'
import { ItemsEnv } from '../config/WorldEnv.js'
import { asBox2 } from '../utils/patch_chunk.js'
import { ItemFullStub, ItemMetadata } from './ChunksFactory.js'
// import { asVect2 } from '../utils/patch_chunk'

export enum SizeProfile {
  SMALL,
  MEDIUM,
  LARGE,
}

/**
 * Referencing all items either coming from schematic definitions or procedurally generated
 */
// ItemsFactory, ItemsCatalog
export class ItemsInventory {
  // TODO rename catalog as inventory
  catalog: Record<ItemType, ItemFullStub> = {}
  itemsEnv: ItemsEnv
  constructor(itemsEnv: ItemsEnv) {
    this.itemsEnv = itemsEnv
  }

  get schematicFilesIndex() {
    return this.itemsEnv.schematics.filesIndex
  }

  getProceduralConfig(id: ItemType) {
    return this.itemsEnv.proceduralConfigs[id]
  }

  // static spawners: Record<ItemType, PseudoDistributionMap> = {}
  /**
   * Populate from schematics
   * @param schematicFileUrls
   * @param optionalDataEncoder
   */
  async importSchematic(itemType: ItemType) {
    const fileUrl = this.schematicFilesIndex[itemType]
    if (fileUrl) {
      const customBlocksMapping =
        this.itemsEnv.schematics.localBlocksMapping[itemType]
      const { globalBlocksMapping } = this.itemsEnv.schematics
      const { metadata, rawdata } = await SchematicLoader.createChunkContainer(
        fileUrl,
        globalBlocksMapping,
        customBlocksMapping,
      )
      const itemRadius = Math.ceil(asBox2(metadata.bounds).getSize(new Vector2).length() / 2)
      const templateMetadata: ItemMetadata = { ...metadata, itemRadius, itemType }
      const templateStub: ItemFullStub = { metadata: templateMetadata, rawdata }
      // const spawner = new PseudoDistributionMap()
      this.catalog[itemType] = templateStub
    }
    return this.catalog[itemType]
  }

  importProcItem(itemType: ItemType) {
    const procConf = this.getProceduralConfig(itemType)
    if (procConf) {
      const chunkStub = ProceduralItemGenerator.voxelizeItem(
        procConf.category,
        procConf.params,
      )
      // const spawner = new PseudoDistributionMap()
      if (chunkStub) {
        const { metadata, rawdata } = chunkStub
        const itemRadius = Math.ceil(asBox2(metadata.bounds).getSize(new Vector2).length() / 2)
        const templateMetadata: ItemMetadata = { ...metadata, itemRadius, itemType }
        const templateStub: ItemFullStub = { metadata: templateMetadata, rawdata }
        this.catalog[itemType] = templateStub
      }
    }
    return this.catalog[itemType]
  }

  async getTemplate(itemType: string) {
    return (
      this.catalog[itemType] ||
      (await this.importSchematic(itemType)) ||
      this.importProcItem(itemType)
    )
  }

  async getTemplateIndex(itemTypes: string[]) {
    // const pendingTemplates = itemTypes.filter(itemType => itemType !== VoidItemType)
    //   .map(async itemType => await this.getTemplate(itemType))
    // const templates = await Promise.all(pendingTemplates)
    // return templates.filter(item => item)
    const templateIndex: Record<ItemType, ItemFullStub> = {}
    const pendingTemplates = itemTypes.filter(itemType => itemType !== VoidItemType)
      .map(async itemType => {
        const template = await this.getTemplate(itemType)
        if (template) templateIndex[itemType] = template
      })
    await Promise.all(pendingTemplates)
    return templateIndex
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
