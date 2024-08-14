// import * as THREE from '../../../three-usage';
// import { voxelmapDataPacking, type IVoxelMap } from '../i-voxelmap';

import { Box3, Vector3, Vector3Like } from 'three'
import { ChunkTools, WorldApi, WorldApiName } from '../index'
import { BlocksContainer } from '../data/Patches'

enum EPlateauSquareType {
    FLAT = 0,
    HOLE = 1,
    OBSTACLE = 2,
}

type PlateauSquare = {
    readonly type: EPlateauSquareType
    readonly materialId: number
}

type ColumnId = { readonly x: number; readonly z: number }

type Plateau = {
    readonly id: number
    readonly size: { readonly x: number; readonly z: number }
    readonly squares: ReadonlyArray<PlateauSquare>
    readonly origin: Vector3Like
}

type PlateauSquareExtended = PlateauSquare & {
    readonly floorY: number
    readonly generation: number
}

let plateauxCount = 0

async function computePlateau(
    originWorld: Vector3Like,
): Promise<Plateau> {
    originWorld = {
        x: Math.floor(originWorld.x),
        y: Math.floor(originWorld.y),
        z: Math.floor(originWorld.z),
    }

    let currentGeneration = 0
    const maxDeltaY = 4
    const plateauHalfSize = 31
    const plateauSize = { x: 2 * plateauHalfSize + 1, z: 2 * plateauHalfSize + 1 }
    const plateauSquares: PlateauSquareExtended[] = []
    for (let iZ = 0; iZ < plateauSize.z; iZ++) {
        for (let iX = 0; iX < plateauSize.x; iX++) {
            plateauSquares.push({
                type: EPlateauSquareType.HOLE,
                materialId: 0,
                floorY: NaN,
                generation: currentGeneration,
            })
        }
    }
    const tryGetIndex = (relativePos: ColumnId) => {
        const plateauCoords = {
            x: relativePos.x + plateauHalfSize,
            z: relativePos.z + plateauHalfSize,
        }
        if (
            plateauCoords.x < 0 ||
            plateauCoords.z < 0 ||
            plateauCoords.x >= plateauSize.x ||
            plateauCoords.z >= plateauSize.z
        ) {
            return null
        }
        return plateauCoords.x + plateauCoords.z * plateauSize.x
    }
    const getIndex = (relativePos: ColumnId) => {
        const index = tryGetIndex(relativePos)
        if (index === null) {
            throw new Error()
        }
        return index
    }
    const setPlateauSquare = (
        relativePos: ColumnId,
        square: PlateauSquareExtended,
    ) => {
        const index = getIndex(relativePos)
        plateauSquares[index] = { ...square }
    }
    const getPlateauSquare = (relativePos: ColumnId) => {
        const index = getIndex(relativePos)
        return plateauSquares[index]!
    }
    const tryGetPlateauSquare = (relativePos: ColumnId) => {
        const index = tryGetIndex(relativePos)
        if (index === null) {
            return null
        }
        return plateauSquares[index]
    }

    const dataMargin = plateauHalfSize + 5
    const dataFromWorld = new Vector3().copy(originWorld).subScalar(dataMargin)
    const dataToWorld = new Vector3().copy(originWorld).addScalar(dataMargin)
    const dataBbox = new Box3(dataFromWorld, dataToWorld)
    const containerStub = await WorldApi.instance.call(
        WorldApiName.PatchCompute,
        [dataBbox]//[patchKey],
    )
    const blocksContainer = BlocksContainer.fromStub(containerStub)
    const chunk = ChunkTools.makeCustomChunk(blocksContainer, dataBbox)
    const data = chunk//await map.getLocalMapData(dataFromWorld, dataToWorld)
    const dataSize = dataToWorld.clone().sub(dataFromWorld)

    const sampleData = (worldPos: Vector3Like) => {
        const dataPos = new Vector3().copy(worldPos).sub(dataFromWorld)
        if (
            dataPos.x < 0 ||
            dataPos.y < 0 ||
            dataPos.z < 0 ||
            dataPos.x >= dataSize.x ||
            dataPos.y >= dataSize.y ||
            dataPos.z >= dataSize.z
        ) {
            throw new Error()
        }
        const index =
            dataPos.x + dataPos.y * dataSize.x + dataPos.z * dataSize.x * dataSize.y
        return data.data[index]!
    }

    {
        const originWorldCoords = {
            x: originWorld.x,
            y: originWorld.y,
            z: originWorld.z,
        }
        let originSample = sampleData(originWorldCoords)
        let deltaY = 0
        while (!originSample && deltaY < maxDeltaY) {
            originWorldCoords.y--
            deltaY++
            originSample = sampleData(originWorldCoords)
        }
        if (!originSample) {
            throw new Error()
        }
        setPlateauSquare(
            { x: 0, z: 0 },
            {
                type: EPlateauSquareType.FLAT,
                materialId: originSample,
                generation: currentGeneration,
                floorY: originWorldCoords.y - 1,
            },
        )
    }
    const originY = getPlateauSquare({ x: 0, z: 0 })!.floorY

    const computePlateauSquare = (
        relativePos: ColumnId,
    ): PlateauSquareExtended | null => {
        const square = getPlateauSquare(relativePos)
        if (square.type !== EPlateauSquareType.HOLE) {
            // this square has been computed already
            return null
        }

        // if this square has not been computed yet
        const xm = tryGetPlateauSquare({ x: relativePos.x - 1, z: relativePos.z })
        const xp = tryGetPlateauSquare({ x: relativePos.x + 1, z: relativePos.z })
        const zm = tryGetPlateauSquare({ x: relativePos.x, z: relativePos.z - 1 })
        const zp = tryGetPlateauSquare({ x: relativePos.x, z: relativePos.z + 1 })

        const worldPos = { x: 0, y: 0, z: 0 }
        worldPos.x = relativePos.x + originWorld.x
        worldPos.z = relativePos.z + originWorld.z

        for (const neighbour of [xm, xp, zm, zp]) {
            if (
                neighbour?.type === EPlateauSquareType.FLAT &&
                neighbour.generation === currentGeneration - 1
            ) {
                worldPos.y = neighbour.floorY
                const generation = currentGeneration
                const sampleY = sampleData(worldPos)

                if (sampleY) {
                    let firstSample: number | null = null
                    let lastSample = sampleY
                    for (let deltaY = 1; deltaY < maxDeltaY; deltaY++) {
                        const sample = sampleData({
                            x: worldPos.x,
                            y: worldPos.y + deltaY,
                            z: worldPos.z,
                        })
                        if (!sample) {
                            return {
                                type: EPlateauSquareType.FLAT,
                                materialId: lastSample,
                                floorY: worldPos.y + deltaY - 1,
                                generation,
                            }
                        } else {
                            firstSample = firstSample ?? sample
                            lastSample = sample
                        }
                    }

                    if (!firstSample) {
                        throw new Error()
                    }

                    return {
                        type: EPlateauSquareType.OBSTACLE,
                        materialId: firstSample,
                        floorY: worldPos.y,
                        generation,
                    }
                } else {
                    for (let deltaY = -1; deltaY > -maxDeltaY; deltaY--) {
                        const sample = sampleData({
                            x: worldPos.x,
                            y: worldPos.y + deltaY,
                            z: worldPos.z,
                        })
                        if (sample) {
                            return {
                                type: EPlateauSquareType.FLAT,
                                materialId: sample,
                                floorY: worldPos.y + deltaY,
                                generation,
                            }
                        }
                    }

                    return {
                        type: EPlateauSquareType.HOLE,
                        materialId: 0,
                        floorY: NaN,
                        generation,
                    }
                }
            }
        }

        return null
    }

    let somethingChanged = false
    do {
        somethingChanged = false
        currentGeneration++

        const relativePos = { x: 0, z: 0 }
        for (
            relativePos.z = -plateauHalfSize;
            relativePos.z <= plateauHalfSize;
            relativePos.z++
        ) {
            for (
                relativePos.x = -plateauHalfSize;
                relativePos.x <= plateauHalfSize;
                relativePos.x++
            ) {
                if (
                    Math.sqrt(
                        relativePos.x * relativePos.x + relativePos.z * relativePos.z,
                    ) >=
                    plateauHalfSize - 1
                ) {
                    continue
                }

                const square = computePlateauSquare(relativePos)
                if (
                    square &&
                    !isNaN(square.floorY) &&
                    Math.abs(square.floorY - originY) < maxDeltaY
                ) {
                    somethingChanged = true
                    setPlateauSquare(relativePos, square)
                }
            }
        }
    } while (somethingChanged)

    const minY = plateauSquares.reduce(
        (y: number, square: PlateauSquareExtended) => {
            if (!isNaN(square.floorY)) {
                return Math.min(y, square.floorY)
            }
            return y
        },
        originY,
    )
    const plateauYShift = minY - originY - 1

    const plateauOrigin = new Vector3(
        originWorld.x - plateauHalfSize,
        originWorld.y + plateauYShift,
        originWorld.z - plateauHalfSize,
    )

    return {
        id: plateauxCount++,
        size: plateauSize,
        squares: plateauSquares,
        origin: plateauOrigin,
    }
}

export { computePlateau, EPlateauSquareType, type Plateau, type PlateauSquare }
