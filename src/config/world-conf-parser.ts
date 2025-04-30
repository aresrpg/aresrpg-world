// these are static functions to be called externally to avoid instance dependance towards itemsInventory

import { RangesLinkedList } from "../datacontainers/LinkedList.js"
import { Noise2dSampler } from "../procgen/NoiseSampler.js"
import { SpawnSubZoneLayer, SpawnTypeLayer, SpawnSparseArea } from "../procgen/Spawn.js"
import { DistributionMode } from "../procgen/Spawn.js"
import { BiomeLandsConf, BiomesConf, BiomeType, BiomesRawConf, SpawnConf, SpawnTypeLayerConf, SparseLayerConf, ZoneLayerConf, SpawnType, SpriteType, PartialLandFields, SpawnAreaConf, SpawnArea, SpawnAreas } from "../utils/common_types.js"

const createSpawnTypeLayer = async <T extends SpawnType | SpriteType>(spawnZoneConf: SpawnTypeLayerConf, spawnTypeDistribution: Noise2dSampler) => {
    const { mode } = spawnZoneConf
    const spawnTypePicker = mode === DistributionMode.SPARSE ?
        await SpawnSparseArea.asyncFactory((spawnZoneConf as SparseLayerConf).weights) :
        new SpawnSubZoneLayer((spawnZoneConf as ZoneLayerConf).thresholds, spawnTypeDistribution)
    return spawnTypePicker as SpawnTypeLayer<T>
}

const parseSpawnArea = async (spawnAreaConf: SpawnAreaConf, spawnZoneKey: string, spawnTypesDistribution: Noise2dSampler) => {
    const schematics = await createSpawnTypeLayer<SpawnType>(spawnAreaConf.schematics, spawnTypesDistribution)
    const sprites = await createSpawnTypeLayer<SpriteType>(spawnAreaConf.sprites, spawnTypesDistribution)
    const { threshold } = spawnAreaConf
    return { schematics, sprites, threshold, key: spawnZoneKey }
}

const parseSpawnConfig = async (spawnConf: SpawnConf, spawnTypesDistribution: Noise2dSampler) => {
    const spawnZonesParsing = Object.entries(spawnConf)
        .map(async ([zoneKey, zoneConf]) => {
            const spawnArea: SpawnArea<SpawnTypeLayer<any>> = await parseSpawnArea(zoneConf, zoneKey, spawnTypesDistribution)
            return spawnArea
        })
    const spawnZonesData = await Promise.all(spawnZonesParsing)
    const spawnZones: SpawnAreas | null = RangesLinkedList.fromArrayStub(spawnZonesData)
    return spawnZones
}

const parseBiomeLands = async (landsConf: BiomeLandsConf, spawnTypesDistribution: Noise2dSampler) => {

    const biomeLandsArr: PartialLandFields[] = []
    for (const [landKey, landRawConf] of Object.entries(landsConf)) {
        const { x, y, spawn, ...landFields } = landRawConf
        const spawnConf = spawn
        const spawnZones = spawnConf ? await parseSpawnConfig(spawnConf, spawnTypesDistribution) : null
        const threshold = landRawConf.x
        const elevation = landRawConf.y
        const landConf: PartialLandFields = { ...landFields, key: landKey, spawn: spawnZones, threshold, elevation }
        biomeLandsArr.push(landConf)
        // landConf.flora =
    }
    const biomeLands = RangesLinkedList.fromArrayStub(biomeLandsArr)
    return biomeLands
}

export const parseBiomesConf = async (biomesRawConf: BiomesRawConf) => {
    const spawnTypesDistribution = new Noise2dSampler('spawn_types')
    spawnTypesDistribution.periodicity = 2
    spawnTypesDistribution.harmonicsCount = 4
    // const biomesConf: Partial<BiomesParsedConf> = {}
    const biomesMappings = {} as BiomesConf
    // complete missing data
    for (const [biomeType, landsConf] of Object.entries(biomesRawConf)) {
        const biomeLands = await parseBiomeLands(landsConf, spawnTypesDistribution)
        // biomesConf[biomeType as BiomeType] = biomeLands
        if (biomeLands) biomesMappings[biomeType as BiomeType] = biomeLands
    }
    return biomesMappings
}