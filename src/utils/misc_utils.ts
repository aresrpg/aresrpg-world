import { BiomeLands, LandConfigFields } from './common_types.js'

// const MappingRangeFinder = (item: LinkedList<MappingData>, inputVal: number) => item.next && inputVal > (item.next.data as MappingData).x
export const MappingRangeSorter = (
  item1: LandConfigFields,
  item2: LandConfigFields,
) => item1.x - item2.x

/**
 * find element with inputVal withing interpolation range
 * @param inputVal
 * @returns
 */
export const findMatchingRange = (
  inputVal: number,
  noiseMappings: BiomeLands,
) => {
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

export function reverseMapping<
  U extends string | number,
  T extends string | number,
>(mapping: Record<U, T>) {
  const reversedMapping = {} as any // as Record<T, U>
  Object.entries(mapping).forEach(
    (cubeOffset, cubeSide) => (reversedMapping[cubeSide] = cubeOffset),
  )
  return reversedMapping
}

export function isBrowserEnv() {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined'
}
