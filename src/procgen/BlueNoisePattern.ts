import alea from 'alea'
import PoissonDiskSampling from 'poisson-disk-sampling'
import { Box2, Vector2 } from 'three'

/**
 * Self repeating seamless pattern
 */
export class BlueNoisePattern {
    bbox: Box2
    params
    elements: Vector2[] = []

    constructor(bbox: Box2, distParams: any) {
        this.bbox = bbox
        this.params = distParams
        this.populate()
    }

    get dimensions() {
        return this.bbox.getSize(new Vector2())
    }

    // populate with discrete elements using relative pos
    populate() {
        const { dimensions, params } = this
        const { aleaSeed } = this.params
        const prng = alea(aleaSeed || '')
        const p = new PoissonDiskSampling(
            {
                shape: [dimensions.x, dimensions.y],
                ...params,
            },
            prng,
        )
        this.elements = p
            .fill()
            .map(point => new Vector2(point[0] as number, point[1] as number).round())
        this.makeSeamless()
    }

    // make seamless repeatable pattern
    makeSeamless() {
        const { dimensions, params } = this
        const radius = params.minDistance / 2
        const edgePoints = this.elements
            .map(point => {
                const pointCopy = point.clone()
                if (point.x - radius < 0) {
                    pointCopy.x += dimensions.x
                } else if (point.x + radius > dimensions.x) {
                    pointCopy.x -= dimensions.x
                }
                if (point.y - radius < 0) {
                    pointCopy.y += dimensions.y
                } else if (point.y + radius > dimensions.y) {
                    pointCopy.y -= dimensions.y
                }
                return pointCopy.round().equals(point) ? null : pointCopy
            })
            .filter(pointCopy => pointCopy)
        edgePoints.forEach(edgePoint => edgePoint && this.elements.push(edgePoint))
    }

    getPatchOrigin(patchId: Vector2) {
        return patchId.clone().multiply(this.dimensions)
    }

    toPatchLocalPos(pos: Vector2, patchId: Vector2) {
        return pos.clone().sub(this.getPatchOrigin(patchId))
    }

    toPatchGlobalPos(relativePos: Vector2, patchId: Vector2) {
        return relativePos.clone().add(this.getPatchOrigin(patchId))
    }

    // DO NOT USE SLOW
    *iterPatchElements(patchOffset: Vector2) {
        // relative to global pos conv
        for (const relativePos of this.elements) {
            const pos = this.toPatchGlobalPos(relativePos, patchOffset)
            yield pos
        }
    }
}
