import { Box3, Vector3 } from 'three'

import { ChunkContainer, ChunkMetadata, ChunkStub } from '../datacontainers/ChunkContainer.js'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { ItemType, VoidItemType } from '../utils/common_types.js'
import { ItemsEnv } from '../config/WorldEnv.js'
// import { asVect2 } from '../utils/patch_chunk'

export enum ItemSize {
  SMALL,
  MEDIUM,
  LARGE,
}

type ItemChunkMetada = ChunkMetadata & {
  itemSize: ItemSize
}

type ItemChunkStub = ChunkStub<ItemChunkMetada>

export class ItemChunk extends ChunkContainer {
  // override readonly rawData = new Uint16Array()

  centerBounds(origin: Vector3) {
    const centeredBounds = new Box3().setFromCenterAndSize(origin, this.dimensions.clone())
    centeredBounds.min.y = origin.y
    centeredBounds.max.y = origin.y + this.dimensions.y
    centeredBounds.min.floor()
    centeredBounds.max.floor()
    return centeredBounds
  }

  offsetBounds(origin: Vector3) {
    const bmin = origin.clone()
    const bmax = origin.clone().add(this.dimensions.clone())
    const offsetBounds = new Box3(bmin, bmax)
    return offsetBounds
  }

  toInstancedChunk(instancePos: Vector3, isOriginCentered = true) {
    const instanceStub = this.toStub()
    const instanceBounds = isOriginCentered
      ? this.centerBounds(instancePos)
      : this.offsetBounds(instancePos)
    instanceStub.metadata.bounds = instanceBounds
    const instancedChunk = new ChunkContainer().fromStub(instanceStub)
    // itemChunk = new ChunkContainer(entityBounds, 0)
    return instancedChunk
  }

  override toStub(): ItemChunkStub {
    const { metadata, rawdata } = super.toStub()
    const itemSize = ItemSize.MEDIUM
    const itemMetada: ItemChunkMetada = { ...metadata, itemSize }
    const itemStub: ItemChunkStub = { metadata: itemMetada, rawdata }
    return itemStub
  }

  override fromStub(templateStub: ItemChunkStub) {
    super.fromStub(templateStub)
    // this.itemSize = templateStub.metadata.itemSize
    return this
  }
}

export class ItemChunkInstance extends ChunkContainer {

}


/**
 * Referencing all items either coming from schematic definitions or procedurally generated
 */
// ItemsFactory, ItemsCatalog
export class ItemsInventory {
  // TODO rename catalog as inventory
  catalog: Record<ItemType, ItemChunk> = {}
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
  async importSchematic(id: ItemType) {
    const fileUrl = this.schematicFilesIndex[id]
    if (fileUrl) {
      const customBlocksMapping =
        this.itemsEnv.schematics.localBlocksMapping[id]
      const { globalBlocksMapping } = this.itemsEnv.schematics
      const chunk = await SchematicLoader.createChunkContainer(
        fileUrl,
        globalBlocksMapping,
        customBlocksMapping,
      )
      // const spawner = new PseudoDistributionMap()
      this.catalog[id] = chunk//.toStub()
    }
    return this.catalog[id]
  }

  importProcItem(id: ItemType) {
    const procConf = this.getProceduralConfig(id)
    if (procConf) {
      const chunk = ProceduralItemGenerator.voxelizeItem(
        procConf.category,
        procConf.params,
      )
      // const spawner = new PseudoDistributionMap()
      if (chunk) {
        this.catalog[id] = chunk//.toStub()
      }
    }
    return this.catalog[id]
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
    const templateIndex: Record<ItemType, ItemChunk> = {}
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
