import { LandscapeFields, LandscapesConf } from "./types"

// const MappingRangeFinder = (item: LinkedList<MappingData>, inputVal: number) => item.next && inputVal > (item.next.data as MappingData).x
export const MappingRangeSorter = (
    item1: LandscapeFields,
    item2: LandscapeFields,
  ) => item1.x - item2.x
  
  /**
   * find element with inputVal withing interpolation range
   * @param inputVal
   * @returns
   */
  export const findMatchingRange = (inputVal: number, noiseMappings: LandscapesConf) => {
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