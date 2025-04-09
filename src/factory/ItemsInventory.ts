import { Vector2 } from 'three'

import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { ItemsEnv, WorldGlobals } from '../config/WorldEnv.js'
import { asBox2 } from '../utils/patch_chunk.js'
import { isNotWorkerEnv } from '../utils/misc_utils.js'

import { SpawnChunkStub, SpawnChunkMetadata } from './ChunksFactory.js'
import { SpawnCategory, SpawnType } from '../utils/common_types.js'
// import { asVect2 } from '../utils/patch_chunk'

/**
 * Referencing all items either coming from schematic definitions or procedurally generated
 */
// ItemsFactory, ItemsCatalog
export class ItemsInventory {
    // TODO rename catalog as inventory
    catalog: Record<SpawnType, SpawnChunkStub> = {}
    itemsEnv: ItemsEnv
    constructor(itemsEnv: ItemsEnv) {
        this.itemsEnv = itemsEnv
    }

    get schematicFilesIndex() {
        return this.itemsEnv.schematics.filesIndex
    }

    getProceduralConfig(id: SpawnType) {
        return this.itemsEnv.proceduralConfigs[id]
    }

    // static spawners: Record<ItemType, PseudoDistributionMap> = {}
    /**
     * Populate from schematics
     * @param schematicFileUrls
     * @param optionalDataEncoder
     */
    async importSchematic(spawnType: SpawnType) {
        const fileUrl = this.schematicFilesIndex[spawnType]
        if (fileUrl) {
            const customBlocksMapping = this.itemsEnv.schematics.localBlocksMapping[spawnType]
            const { globalBlocksMapping } = this.itemsEnv.schematics
            const { metadata, rawdata } = await SchematicLoader.createChunkContainer(fileUrl, globalBlocksMapping, customBlocksMapping)
            const spawnRadius = Math.ceil(asBox2(metadata.bounds).getSize(new Vector2()).length() / 2)
            // TODO remove hardcoded values
            const spawnCat = spawnRadius >= 32 ? SpawnCategory.Structure : SpawnCategory.Flora
            const templateMetadata: SpawnChunkMetadata = {
                ...metadata,
                spawnType,
                spawnCat,
                spawnRadius,
            }
            const templateStub: SpawnChunkStub = { metadata: templateMetadata, rawdata }
            WorldGlobals.instance.debug.logs &&
                isNotWorkerEnv() &&
                console.log(`loaded schematic ${spawnType}, radius: ${spawnRadius}, cat: ${spawnCat}`)
            // const spawner = new PseudoDistributionMap()
            this.catalog[spawnType] = templateStub
        }
        return this.catalog[spawnType]
    }

    importProcItem(spawnType: SpawnType) {
        const procConf = this.getProceduralConfig(spawnType)
        if (procConf) {
            const chunkStub = ProceduralItemGenerator.voxelizeItem(procConf.category, procConf.params)
            // const spawner = new PseudoDistributionMap()
            if (chunkStub) {
                const { metadata, rawdata } = chunkStub
                const spawnRadius = Math.ceil(asBox2(metadata.bounds).getSize(new Vector2()).length() / 2)
                // TODO remove hardcoded values
                const spawnCat = spawnRadius >= 32 ? SpawnCategory.Structure : SpawnCategory.Flora
                const templateMetadata: SpawnChunkMetadata = {
                    ...metadata,
                    spawnRadius,
                    spawnType,
                    spawnCat
                }
                const templateStub: SpawnChunkStub = {
                    metadata: templateMetadata,
                    rawdata,
                }
                this.catalog[spawnType] = templateStub
            }
        }
        return this.catalog[spawnType]
    }

    async loadTemplate(spawnType: string) {
        return this.catalog[spawnType] || (await this.importSchematic(spawnType)) || this.importProcItem(spawnType)
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
