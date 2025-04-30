import { Vector2 } from 'three'

import { ProceduralItemGenerator } from '../tools/ProceduralGenerators.js'
import { SchematicLoader } from '../tools/SchematicLoader.js'
import { InventoryEnv, WorldGlobals } from '../config/WorldEnv.js'
import { asBox2 } from '../utils/patch_chunk.js'
import { isNotWorkerEnv } from '../utils/misc_utils.js'
import { SpawnCategory, SpawnType } from '../utils/common_types.js'

import { SpawnChunkStub, SpawnChunkMetadata } from './ChunksFactory.js'
// import { asVect2 } from '../utils/patch_chunk'

/**
 * Referencing all items from schematic content or procedural definitions
 */
// ItemsFactory, ItemsCatalog
export class SpawnInventory {
    // eslint-disable-next-line no-use-before-define
    static singleton: SpawnInventory
    static get instance() {
        this.singleton = this.singleton || new SpawnInventory()
        return this.singleton
    }

    catalog: Record<SpawnType, SpawnChunkStub> = {}
    // externally provided
    inventoryEnv!: InventoryEnv

    populateInventory() {}

    get schematicFilesIndex() {
        return this.inventoryEnv.schematics.filesIndex
    }

    getProceduralConfig(id: SpawnType) {
        return this.inventoryEnv.proceduralConfigs[id]
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
            const customBlocksMapping = this.inventoryEnv.schematics.localBlocksMapping[spawnType]
            const { globalBlocksMapping } = this.inventoryEnv.schematics
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
                    spawnCat,
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
