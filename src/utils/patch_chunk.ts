import { Box2, Box3, Vector2, Vector2Like, Vector3, Vector3Like } from 'three'

import { ChunkKey, PatchId, PatchKey } from './common_types.js'

const asVect2 = (v3: Vector3Like) => {
    return new Vector2(v3.x, v3.z)
}

const asVect3 = (v2: Vector2Like, yVal = 0) => {
    return new Vector3(v2.x, yVal, v2.y)
}

const asVect2Like = ({ x, z }: Vector3Like) => {
    return { x, y: z }
}

const asVect3Like = ({ x, y }: Vector2Like, yVal = 0) => {
    return { x, y: yVal, z: y }
}

const asBox2 = (box3: Box3) => {
    return new Box2(asVect2(box3.min), asVect2(box3.max))
}

const asBox3 = (box2: Box2, ymin = 0, ymax = 0) => {
    return new Box3(asVect3(box2.min, ymin), asVect3(box2.max, ymax))
}

const isVect2Stub = (stub: Vector2Like) => {
    return stub !== undefined && stub.x !== undefined && stub.y !== undefined && (stub as any).z === undefined
}

const isVect3Stub = (stub: Vector3Like) => {
    return stub !== undefined && stub.x !== undefined && stub.y !== undefined && stub.z !== undefined
}

const parseVect3Stub = (stub: Vector3Like) => {
    let res
    if (isVect3Stub(stub)) {
        res = new Vector3(...Object.values(stub))
    }
    return res
}

const parseVect2Stub = (stub: Vector2Like) => {
    let res
    if (isVect2Stub(stub)) {
        res = new Vector2(...Object.values(stub))
    }
    return res
}

const parseBox2Stub = (stub: Box2) => {
    let res
    if (isVect2Stub(stub.min) && isVect2Stub(stub.max)) {
        const min = parseVect2Stub(stub.min)
        const max = parseVect2Stub(stub.max)
        res = new Box2(min, max)
    }
    return res
}

const parseBox3Stub = (stub: Box3) => {
    let res
    if (isVect3Stub(stub.min) && isVect3Stub(stub.max)) {
        const min = parseVect3Stub(stub.min)
        const max = parseVect3Stub(stub.max)
        res = new Box3(min, max)
    }
    return res
}

const parseThreeStub = (stub: any) => {
    return stub ? parseBox3Stub(stub) || parseVect3Stub(stub) || parseBox2Stub(stub) || parseVect2Stub(stub) || stub : stub
}

const parsePatchKey = (patchKey: PatchKey) => {
    let patchId
    if (patchKey?.length > 0) {
        patchId = new Vector2(parseInt(patchKey.split(':')[0] as string), parseInt(patchKey.split(':')[1] as string))
    }
    return patchId
}

const patchUpperId = (position: Vector2, patchSize: Vector2) => {
    const patchId = position.clone().divide(patchSize).ceil()
    return patchId
}

const serializePatchId = (patchId: PatchId | undefined) => {
    let patchKey = ''
    if (patchId) {
        const { x, y } = patchId
        patchKey = `${x}:${y}`
    }
    return patchKey
}

const asPatchBounds = (patchKey: string, patchDims: Vector2) => {
    const patchCoords = parsePatchKey(patchKey)
    const bbox = new Box2()
    if (patchCoords) {
        bbox.min = patchCoords.clone().multiply(patchDims)
        bbox.max = patchCoords.clone().addScalar(1).multiply(patchDims)
    }
    return bbox
}

const getScalarId = (scalarValue: number, size: number) => {
    const scalarId = Math.floor(scalarValue / size)
    return scalarId
}

const getUpperScalarId = (scalarValue: number, size: number) => {
    const scalarId = Math.ceil(scalarValue / size)
    return scalarId
}

const getPatchId = <T extends Vector2 | Vector2Like>(position: T, patchSize: T) => {
    const patchId =
        position instanceof Vector2
            ? position.clone().divide(patchSize).floor()
            : {
                  x: getScalarId(position.x, patchSize.x),
                  y: getScalarId(position.y, patchSize.y),
              }
    return patchId as T
}

const patchRangeFromMapCenterRad = (patchMapCenter: Vector2, patchMapRadius: number) => {
    const bmin = patchMapCenter.clone().subScalar(patchMapRadius)
    const bmax = patchMapCenter.clone().addScalar(patchMapRadius)
    const patchMapRange = new Box2(bmin, bmax)
    return patchMapRange
}

const patchIndexFromMapRange = (mapRange: Box2) => {
    const patchIndex: Record<PatchKey, boolean> = {}
    // const patchIds = []
    const { min, max } = mapRange
    for (let { y } = min; y <= max.y; y++) {
        for (let { x } = min; x <= max.x; x++) {
            const patchId = new Vector2(x, y)
            const patchKey = serializePatchId(patchId)
            patchIndex[patchKey] = true
            // patchIds.push(new Vector2(x, y))
        }
    }
    return patchIndex
}

const patchRangeFromBounds = (bounds: Box2, patchDims: Vector2) => {
    const rangeMin = getPatchId(bounds.min, patchDims)
    const rangeMax = getPatchId(bounds.max, patchDims) // patchUpperId(bounds.max, patchDims) // .addScalar(1)
    const patchRange = new Box2(rangeMin, rangeMax)
    return patchRange
}

const patchRangeToBounds = (mapRange: Box2, patchDims: Vector2) => {
    const { min, max } = mapRange
    const minBounds = min.clone().multiplyScalar(patchDims.x)
    const maxBounds = max.clone().multiplyScalar(patchDims.y)
    const bounds = new Box2(minBounds, maxBounds)
    return bounds
}

const getPatchIds = (bounds: Box2, patchDims: Vector2) => {
    const patchIds = []
    const patchRange = patchRangeFromBounds(bounds, patchDims)
    // iter elements on computed range
    const { min, max } = patchRange
    for (let { y } = min; y <= max.y; y++) {
        for (let { x } = min; x <= max.x; x++) {
            patchIds.push(new Vector2(x, y))
        }
    }
    return patchIds
}

const getRoundedBox = (bounds: Box2, patchDims: Vector2) => {
    const { min, max } = patchRangeFromBounds(bounds, patchDims)
    min.multiply(patchDims)
    max.multiply(patchDims)
    const extBbox = new Box2(min, max)
    return extBbox
}

const getChunkId = (position: Vector3Like, chunkSize: Vector3Like) => {
    const chunkId =
        position instanceof Vector3
            ? position.clone().divide(chunkSize).floor()
            : {
                  x: getScalarId(position.x, chunkSize.x),
                  y: getScalarId(position.y, chunkSize.y),
                  z: getScalarId(position.z, chunkSize.z),
              }
    return chunkId
}

const parseChunkKey = (chunkKey: ChunkKey): Vector3 | undefined => {
    const [x_str, y_str, z_str] = chunkKey.split('_')

    const x = Number(x_str)
    const y = Number(y_str)
    const z = Number(z_str)

    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        return new Vector3(x, y, z)
    }

    return undefined
}

const serializeChunkId = (chunkId: Vector3Like) => {
    return `${chunkId.x}_${chunkId.y}_${chunkId.z}`
}

const asChunkBounds = (chunkKey: string, chunkDims: Vector3Like) => {
    const chunkId = parseChunkKey(chunkKey)
    const bbox = new Box3()
    if (chunkId) {
        bbox.min = chunkId.clone().multiply(chunkDims)
        bbox.max = chunkId.clone().addScalar(1).multiply(chunkDims)
    }
    return bbox
}

function genChunkIds(patchId: PatchId, ymin: number, ymax: number) {
    const chunk_ids = []
    for (let y = ymax; y >= ymin; y--) {
        const chunk_coords = asVect3(patchId, y)
        chunk_ids.push(chunk_coords)
    }
    return chunk_ids
}

export {
    // roundToDec,
    // vectRoundToDec,
    isVect2Stub,
    isVect3Stub,
    parseThreeStub,
    asVect2,
    asVect3,
    asVect2Like,
    asVect3Like,
    asBox2,
    asBox3,
    parsePatchKey,
    getScalarId,
    getUpperScalarId,
    getPatchId,
    patchUpperId,
    serializePatchId,
    // getBoundsPatchRange,
    patchRangeFromBounds,
    patchRangeToBounds,
    patchRangeFromMapCenterRad,
    patchIndexFromMapRange,
    getPatchIds,
    getRoundedBox,
    asPatchBounds,
    getChunkId,
    parseChunkKey,
    serializeChunkId,
    asChunkBounds,
    genChunkIds,
}
