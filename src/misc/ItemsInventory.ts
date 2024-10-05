import { Box2, Vector2, Vector3 } from "three"
import { asVect2 } from "../common/utils"
import { ChunkContainer } from "../datacontainers/ChunkContainer"
import { PseudoDistributionMap } from "../datacontainers/RandomDistributionMap"
import { ProceduralItemGenerator, ProcItemConf } from "../tools/ProceduralGenerators"
import { SchematicLoader } from "../tools/SchematicLoader"

export type ItemId = string 

/**
 * Referencing  all items generated from procedural or external schematic templates
 */

export class ItemsInventory {
    static catalog: Record<ItemId, ChunkContainer> = {}
    static spawners: Record<ItemId, PseudoDistributionMap> = {}
    /**
     * Populate from schematics
     * @param schematicFileUrls 
     * @param optionalDataEncoder 
     */
    static async importSchematics(schematicFileUrls: Record<ItemId, string>, optionalDataEncoder?: () => number) {
        const items = Object.entries(schematicFileUrls)
        for await (const [id, fileUrl] of items) {
            const chunkDef = await SchematicLoader.createChunkContainer(fileUrl, optionalDataEncoder)
            // const spawner = new PseudoDistributionMap()
            ItemsInventory.catalog[id] = chunkDef
        }
    }

    static async importProceduralObjects(procItemsBatch: Record<ItemId, ProcItemConf>, optionalDataEncoder?: () => number) {
        const items = Object.entries(procItemsBatch)
        for await (const [id, conf] of items) {
            const itemChunk = ProceduralItemGenerator.voxelizeItem(conf.category, conf.params, optionalDataEncoder)
            // const spawner = new PseudoDistributionMap()
            if (itemChunk) {
                ItemsInventory.catalog[id] = itemChunk
            }
        }
    }

    static querySpawnedEntities(itemId: string, spawnRegion: Box2) {
        const itemChunk = this.catalog[itemId]
        const itemSpawner = this.spawners[itemId]

        let spawnPlaces: Vector2[] = []
        if (itemChunk && itemSpawner) {
            const dims = itemChunk.bounds.getSize(new Vector3())
            const entityOverlapTest = (testRegion: Box2, spawnLoc: Vector2) => new Box2().setFromCenterAndSize(spawnLoc, asVect2(dims)).intersectsBox(testRegion)
            spawnPlaces = itemSpawner.querySpawnLocations(spawnRegion, entityOverlapTest)//.map(loc => asVect3(loc, 0))
            // const instancedEntities: InstancedEntity[] = spawnLocations.map(spawnLoc => ({ entity, spawnLoc }))
        }

        return spawnPlaces
    }
}

export class ItemsSpawner {
    static spawners: Record<ItemType, PseudoDistributionMap>
}