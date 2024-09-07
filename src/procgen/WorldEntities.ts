import { Box2, Box3, Vector2 } from 'three'
import { Vector3 } from 'three/src/math/Vector3'

import { EntityData, EntityType } from '../common/types'
import { PseudoDistributionMap } from '../index'

// TODO remove hardcoded entity dimensions to compute from entity type
const entityDefaultDims = new Vector3(10, 20, 10)

// TODO rename as WorldDistribution
export class WorldEntities {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldEntities
  static get instance() {
    this.singleton = this.singleton || new WorldEntities()
    return this.singleton
  }

  entityDistributionMapping: Record<EntityType, PseudoDistributionMap>

  constructor() {
    const treeDistribution = new PseudoDistributionMap()

    this.entityDistributionMapping = {
      [EntityType.NONE]: treeDistribution,
      [EntityType.TREE_APPLE]: treeDistribution,
      [EntityType.TREE_PINE]: treeDistribution,
    }
  }

  queryDistributionMap(entityType: EntityType) {
    const entityRadius = this.getEntityData(entityType).params.radius
    const intersectsEntity = (testRange: Box2, entityPos: Vector2) =>
      testRange.distanceToPoint(entityPos) <= entityRadius
    const distributionMap = this.entityDistributionMapping[entityType]
    const query = (bbox: Box2) =>
      distributionMap.querySpawnLocations(bbox, intersectsEntity)
    return query
  }

  getEntityData(entityType: EntityType, entityPos?: Vector3) {
    // TODO custom entity shape and params from entity type
    entityPos = entityPos || new Vector3()
    entityPos.y = entityDefaultDims.y / 2
    const entityShape = new Box3().setFromCenterAndSize(
      entityPos,
      entityDefaultDims,
    )
    const entityParams = {
      radius: 5,
      size: 10,
    }
    const entityData: EntityData = {
      type: entityType,
      bbox: entityShape,
      params: entityParams,
    }
    return entityData // entityBox.translate(entityPos)
  }
}
