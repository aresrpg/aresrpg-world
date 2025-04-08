/**
 * Low level data operations over data containers
 */

import { Vector2 } from 'three'

import { PatchDataContainer } from '../datacontainers/PatchBase.js'

import { BlockType } from './common_types.js'

// copy occurs only on the overlapping global pos region of both containers
export const copySourceToTargetPatch = (source: PatchDataContainer, target: PatchDataContainer, skipEmpty = true) => {
    // const adjustOverlapMargins = (overlap: Box2) => {
    //   const margin = Math.min(target.margin, source.margin) || 0
    //   overlap.min.x -= target.bounds.min.x === overlap.min.x ? margin : 0
    //   overlap.min.y -= target.bounds.min.y === overlap.min.y ? margin : 0
    //   overlap.max.x += target.bounds.max.x === overlap.max.x ? margin : 0
    //   overlap.max.y += target.bounds.max.y === overlap.max.y ? margin : 0
    // }

    if (source.bounds.intersectsBox(target.bounds)) {
        const overlap = target.extendedBounds.clone().intersect(source.extendedBounds)
        // adjustOverlapMargins(overlap)
        for (let { y } = overlap.min; y < overlap.max.y; y++) {
            // const globalStartPos = new Vector3(x, 0, overlap.min.y)
            const globalStartPos = new Vector2(overlap.min.x, y)
            const targetLocalStartPos = target.toLocalPos(globalStartPos)
            const sourceLocalStartPos = source.toLocalPos(globalStartPos)
            let targetIndex = target.getIndex(targetLocalStartPos)
            let sourceIndex = source.getIndex(sourceLocalStartPos)
            for (let { x } = overlap.min; x < overlap.max.x; x++) {
                const sourceVal = source.rawData[sourceIndex]
                if (sourceVal || (!skipEmpty && sourceVal === BlockType.NONE)) {
                    target.rawData[targetIndex] = sourceVal
                }
                sourceIndex++
                targetIndex++
            }
        }
    }
}
