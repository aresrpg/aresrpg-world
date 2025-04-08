import { BiomeLands, LandFields, SpawnElement, VoidItemType } from './common_types.js'

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

export const pickSpawnedElement = (spawnElements: SpawnElement[], randomIndex: number, maxSpawnSize: number) => {
    const pickingList: string[] = []

    // reject any item not matching size requirements at specific pos
    spawnElements
        .filter(spawnElt => spawnElt.type === VoidItemType || spawnElt.size <= maxSpawnSize)
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

export function isBrowserEnv() {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}

export const isWorkerEnv = () => typeof self !== 'undefined'
export const isNotWorkerEnv = () => typeof window !== 'undefined'
