import { Box3, Vector3 } from 'three'

import { ChunkContainer } from '../datacontainers/ChunkContainer.js'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { ItemType } from '../utils/common_types.js'
import { ItemsEnv } from '../config/WorldEnv.js'
// import { asVect2 } from '../utils/patch_chunk'

const getOffsetBounds = (origin: Vector3, dims: Vector3) => {
  const bmin = origin.clone()
  const bmax = origin.clone().add(dims)
  const offsetBounds = new Box3(bmin, bmax)
  return offsetBounds
}

const getCenteredBounds = (origin: Vector3, dims: Vector3) => {
  const centeredBounds = new Box3().setFromCenterAndSize(origin, dims)
  centeredBounds.min.y = origin.y
  centeredBounds.max.y = origin.y + dims.y
  centeredBounds.min.floor()
  centeredBounds.max.floor()
  return centeredBounds
}

/**
 * Referencing all items either coming from schematic definitions or procedurally generated
 */
// ItemsFactory, ItemsCatalog
export class ItemsInventory {
  // TODO rename catalog as inventory
  catalog: Record<ItemType, ChunkContainer> = {}
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
    let chunk
    if (fileUrl) {
      const customBlocksMapping =
        this.itemsEnv.schematics.localBlocksMapping[id]
      const { globalBlocksMapping } = this.itemsEnv.schematics
      chunk = await SchematicLoader.createChunkContainer(
        fileUrl,
        globalBlocksMapping,
        customBlocksMapping,
      )
      // const spawner = new PseudoDistributionMap()
      this.catalog[id] = chunk
    }
    return chunk
  }

  importProcItem(id: ItemType) {
    const procConf = this.getProceduralConfig(id)
    let chunk
    if (procConf) {
      chunk = ProceduralItemGenerator.voxelizeItem(
        procConf.category,
        procConf.params,
      )
      // const spawner = new PseudoDistributionMap()
      if (chunk) {
        this.catalog[id] = chunk
      }
    }
    return chunk
  }

  async getTemplateChunk(itemId: string) {
    return (
      this.catalog[itemId] ||
      (await this.importSchematic(itemId)) ||
      this.importProcItem(itemId)
    )
  }

  getInstancedChunk = async (
    itemType: ItemType,
    itemPos: Vector3,
    originCentered = true,
    shallowInstance = false,
  ) => {
    let itemChunk: ChunkContainer | undefined
    const templateChunk = await this.getTemplateChunk(itemType)
    if (templateChunk) {
      const itemDims = templateChunk.bounds.getSize(new Vector3())
      const itemBounds = originCentered
        ? getCenteredBounds(itemPos, itemDims)
        : getOffsetBounds(itemPos, itemDims)
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
