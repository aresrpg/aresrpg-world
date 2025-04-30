// const make_spawn_distribution

/**
 * Spawn conf generators
 */

import { DistributionMode } from '../procgen/Spawn.js'
import {
    SparseLayerConf,
    SpawnAreaConf,
    SpawnConf,
    SpawnType,
    SpawnTypeLayerConf,
    SpriteType,
    ZoneLayerConf,
} from '../utils/common_types.js'

// const mushroom_mix = {
//     mode: DistributionMode.ZONES,
//     thresholds: {
//         mushroom1: 0,
//         mushroom2: 0.33,
//         mushroom3: 0.66,
//     }
// }

// const flora_grass_mix = {
//     mode: DistributionMode.ZONES,
//     thresholds: {
//         flower1: 0.3,
//         grass: 0.5,
//         flower2: 0.7
//     }
// }

// type SpriteType = string

export class SpawnArea {
    name: string
    threshold: number
    sparseSchematics: SpawnTypeLayerConf<SparseLayerConf> = {
        mode: DistributionMode.SPARSE,
        weights: {},
    }

    schematicsZone: SpawnTypeLayerConf<ZoneLayerConf> = {
        mode: DistributionMode.ZONES,
        thresholds: {},
    }

    sparseSprites: SpawnTypeLayerConf<SparseLayerConf> = {
        mode: DistributionMode.SPARSE,
        weights: {},
    }

    spriteZones: SpawnTypeLayerConf<ZoneLayerConf> = {
        mode: DistributionMode.ZONES,
        thresholds: {},
    }

    constructor(name: string, threshold: number) {
        this.name = name
        this.threshold = threshold
    }

    addSchematicsCollection(collection: any) {
        this.sparseSchematics.weights = { ...this.sparseSchematics.weights, ...collection }
        return this
    }

    addSparseSchematic(type: SpawnType, weight: number) {
        this.sparseSchematics.weights[type] = weight
        return this
    }

    addSpriteZone(type: SpriteType, threshold: number) {
        this.spriteZones.thresholds[type] = threshold
        return this
    }

    addSparseSprite(type: SpriteType, weight: number) {
        this.sparseSchematics.weights[type] = weight
        return this
    }

    toJsonConf() {
        const { threshold, spriteZones, sparseSprites, schematicsZone, sparseSchematics } = this
        const isSpriteZones = Object.keys(spriteZones.thresholds).length > 0
        const isSchematicsZones = Object.keys(schematicsZone.thresholds).length > 0
        const sprites = isSpriteZones ? spriteZones : sparseSprites
        const schematics = isSchematicsZones ? schematicsZone : sparseSchematics
        const areaConf: SpawnAreaConf = { threshold, sprites, schematics }
        return areaConf
    }
}

export const SpawnConfHelper = (...spawnAreas: SpawnArea[]) => {
    const spawnConf: SpawnConf = {}
    spawnAreas.forEach(spawnArea => (spawnConf[spawnArea.name] = spawnArea.toJsonConf()))
    return spawnConf
}

// class SpawnConfHelper extends RangesLinkedList<SpawnZone> {

//     export(){
//         const spawnConf:SpawnConf={}
//     }
// }

// .insertItem({ threshold: 0, spriteType: 'flower1' })
// .insertItem({ threshold: 0.33, spriteType: 'grass' })
// .insertItem({ threshold: 0.66, spriteType: 'flower2' })

// .insert(new SpawnConfHelper('forest', 0)
// .sparseSchematics(temperate_forest.medium)
// .spritesZones(mushrooms))
// .insert(new SpawnConfHelper('grass', 0.33)
//     .spritesZones(flora_mix))
// .insert(new SpawnConfHelper('village', 0.66)
//     .sparseSchematics({ 'structures/mce-desertpyramid': 1 }))
