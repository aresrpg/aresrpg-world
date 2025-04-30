import { Box3, Vector3 } from 'three'

import { BiomeType } from './common_types.js'
import { parseThreeStub } from './patch_chunk.js'

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
