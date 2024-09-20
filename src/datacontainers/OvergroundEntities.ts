import { Box2, Vector2, Vector3 } from "three";
import { asVect2, asVect3 } from "../common/utils";
import { ChunkContainer } from "./ChunkContainer";
import { PseudoDistributionMap } from "./RandomDistributionMap";

export enum WorldObjectType {
    PineTree_10_5,
    AppleTree_10_5,
    SpruceTree_schem,
}

type WorldEntity = {
    type: WorldObjectType
    template: ChunkContainer // builder template
}

type SpawnableEntity = {
    entity: WorldEntity
    spawner: PseudoDistributionMap
}
// or SpawnedEntity
export type InstancedEntity = {
    entity: WorldEntity,
    spawnLoc: Vector3,
}

/**
 * Voxelizable items spawning inside world
 * To register object type, should be provided object's
 * - voxels definition (template)
 * - spawner (distribution)
 */
export class OvergroundEntities {
    static registered: Record<WorldObjectType, SpawnableEntity> = {}
    // object external builder (proc generator, schematic loader)

    static registerEntity({ entity, spawner }: SpawnableEntity) {
        this.registered[entity.type] = { entity, spawner }
    }

    static querySpawnedEntities(entityType: WorldObjectType, spawnRegion: Box2) {
        const record = this.registered[entityType]
        const { entity, spawner } = record
        const entityDims = entity.template.bounds.getSize(new Vector3())
        const entityOverlapTest = (testRegion: Box2, spawnLoc: Vector2) => new Box2().setFromCenterAndSize(spawnLoc, asVect2(entityDims)).intersectsBox(testRegion)
        const spawnLocations = spawner.querySpawnLocations(spawnRegion, entityOverlapTest).map(loc => asVect3(loc, 0))
        const instancedEntities: InstancedEntity[] = spawnLocations.map(spawnLoc => ({ entity, spawnLoc }))
        return instancedEntities
    }

    // get object's buffer at queried location, from its instance
    static getInstancedEntityBuffer({ entity, spawnLoc }: InstancedEntity, queriedPos: Vector2) {
        // translate queried loc to template local pos
        const localPos = queriedPos.clone().sub(spawnLoc)
        const buffer = entity.template.readBufferY(localPos)
        return buffer
    }
}

