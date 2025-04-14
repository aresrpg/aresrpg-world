import { Box3, Vector3 } from 'three'
import { BiomeLands, BiomeType, LandFields, SpawnElement, VoidSpawnType } from './common_types.js'
import { parseThreeStub } from './patch_chunk.js'

// const MappingRangeFinder = (item: LinkedList<MappingData>, inputVal: number) => item.next && inputVal > (item.next.data as MappingData).x
export const MappingRangeSorter = (item1: LandFields, item2: LandFields) => item1.x - item2.x

/**
 * find element with inputVal withing interpolation range
 * @param inputVal
 * @returns
 */
export const findMatchingRange = (inputVal: number, noiseMappings: BiomeLands) => {
    let match = noiseMappings.first()
    let i = 1
    while (match.next && inputVal > match.next.data.x) {
        match = match.next
        i++
    }
    return i
}

export const typesNumbering = (types: Record<string, number>, offset = 0) =>
    Object.keys(types).forEach((key, i) => (types[key] = offset + i))

export function reverseMapping<U extends string | number, T extends string | number>(mapping: Record<U, T>) {
    const reversedMapping = {} as any // as Record<T, U>
    Object.entries(mapping).forEach((cubeOffset, cubeSide) => (reversedMapping[cubeSide] = cubeOffset))
    return reversedMapping
}

export const BiomeNumericType: Record<BiomeType, number> = {
    [BiomeType.Temperate]: 0,
    [BiomeType.Arctic]: 0,
    [BiomeType.Desert]: 0,
    [BiomeType.Tropical]: 0,
    [BiomeType.Scorched]: 0,
    [BiomeType.Swamp]: 0,
    [BiomeType.Glacier]: 0,
    [BiomeType.Taiga]: 0,
    [BiomeType.Grassland]: 0,
}

typesNumbering(BiomeNumericType)

export const reverseBiomeNumericType: Record<number, BiomeType> = {}
Object.keys(BiomeNumericType).forEach((type, i) => (reverseBiomeNumericType[i] = type as BiomeType))

export const pickSpawnedElement = (spawnElements: SpawnElement[], randomIndex: number, maxSpawnSize: number) => {
    const pickingList: string[] = []

    // reject any item not matching size requirements at specific pos
    spawnElements
        .filter(spawnElt => spawnElt.type === VoidSpawnType || spawnElt.size <= maxSpawnSize)
        .forEach(spawnElt => {
            let { weight } = spawnElt
            while (weight-- > 0) pickingList.push(spawnElt.type)
        })
    // among items matching spawnable sizes pick one using random generated index
    const pickingListSize = pickingList.length
    if (pickingListSize > 0) {
        const pickedElement = pickingList[randomIndex % pickingListSize] || ''
        return pickedElement
    }
    return null
}

export const adjustItemBounds = (initialBounds: Box3, origin?: Vector3, isOriginCentered = true) => {
    initialBounds = parseThreeStub(initialBounds)
    if (origin) {
        const dimensions = initialBounds.getSize(new Vector3())
        if (isOriginCentered) {
            const centeredBounds = new Box3().setFromCenterAndSize(origin, dimensions)
            centeredBounds.min.y = origin.y
            centeredBounds.max.y = origin.y + dimensions.y
            centeredBounds.min.floor()
            centeredBounds.max.floor()
            return centeredBounds
        } else {
            const bmin = origin.clone()
            const bmax = origin.clone().add(dimensions.clone())
            const offsetBounds = new Box3(bmin, bmax)
            return offsetBounds
        }
    } else return initialBounds
}

export function isBrowserEnv() {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}

export const isWorkerEnv = () => typeof self !== 'undefined'
export const isNotWorkerEnv = () => typeof window !== 'undefined'
