import { ChunkContainer } from "../datacontainers/ChunkContainer"
import { ProceduralItemGenerator, ProcItemConf } from "../tools/ProceduralGenerators"
import { SchematicLoader } from "../tools/SchematicLoader"

export type ItemType = string

/**
 * Referencing  all items generated from procedural or external schematic templates
 */

export class ItemsInventory {
    static externalResources: {
        procItemsConfigs: Record<ItemType, ProcItemConf>
        schemFileUrls: Record<ItemType, string>
    } = {
            procItemsConfigs: {},
            schemFileUrls: {}
        }
    static catalog: Record<ItemType, ChunkContainer> = {}
    // static spawners: Record<ItemType, PseudoDistributionMap> = {}
    /**
     * Populate from schematics
     * @param schematicFileUrls 
     * @param optionalDataEncoder 
     */
    static async importSchematic(id: ItemType) {
        const fileUrl = this.externalResources.schemFileUrls[id]
        let chunk
        if (fileUrl) {
            chunk = await SchematicLoader.createChunkContainer(fileUrl)
            // const spawner = new PseudoDistributionMap()
            ItemsInventory.catalog[id] = chunk
        }
        return chunk
    }

    static importProcItem(id: ItemType) {
        const procConf = this.externalResources.procItemsConfigs[id]
        let chunk
        if (procConf) {
            chunk = ProceduralItemGenerator.voxelizeItem(procConf.category, procConf.params)
            // const spawner = new PseudoDistributionMap()
            if (chunk) {
                ItemsInventory.catalog[id] = chunk
            }
        }
        return chunk
    }

    static async getItem(itemId: string) {
        return this.catalog[itemId] || await this.importSchematic(itemId) || this.importProcItem(itemId)
    }
}