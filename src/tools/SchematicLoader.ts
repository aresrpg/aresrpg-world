import { Box3, Vector3 } from 'three'

import { NBTReader } from '../libs/nbt_custom.js'
import { BlockType } from '../utils/common_types.js'
import { isNotWorkerEnv } from '../utils/misc_utils.js'
import { WorldGlobals } from '../config/WorldEnv.js'
import { BlockDataType, ChunkBlockData, SolidBlockData } from '../datacontainers/BlockDataAdapter.js'
import { ChunkBlocksContainer } from '../factory/ChunksFactory.js'

export type SchematicsBlocksMapping = Record<string, BlockType>

function isBrowser() {
    return typeof FileReader !== 'undefined' && typeof fetch !== 'undefined'
}

async function decompressData(data: ArrayBuffer) {
    const decompressionStream = new DecompressionStream('gzip') // You can specify 'gzip', 'deflate', or 'brotli'
    const responseStream = new Response(data)
    const decompressedStream = responseStream.body?.pipeThrough(decompressionStream)

    const res = await new Response(decompressedStream).arrayBuffer()
    return res
}

export class SchematicLoader {
    static async loadNode(path: string) {
        const { readFile } = await import('fs/promises')
        const buffer = await readFile(path)
        return await decompressData(buffer as any)
    }

    static async loadBrowser(path: string) {
        // const schem = await Schematic.read(Buffer.from(schemData), '1.16.4')
        const res = await fetch(path)
        const blob = await res.blob()
        const rawData = await new Promise(resolve => {
            // eslint-disable-next-line no-undef
            const reader = new FileReader()
            reader.onload = async function (event) {
                const blobData = event?.target?.result as ArrayBuffer
                const res = blobData ? await decompressData(blobData) : null
                resolve(res)
            }
            reader.readAsArrayBuffer(blob)
        })
        return rawData
    }

    static async load(path: string) {
        if (isBrowser()) return this.loadBrowser(path)
        else return this.loadNode(path)
    }

    static async parse(rawData: any) {
        return new Promise(resolve => {
            NBTReader.parse(rawData, function (error: any, data: unknown) {
                if (error) {
                    throw error
                }
                resolve(data)
            })
        })
    }

    /**
     * convert schematic format to world object
     * @param schemBlocks
     * @returns
     */
    static async createChunkContainer(
        fileUrl: string,
        globalBlocksMapping: SchematicsBlocksMapping,
        localBlocksMapping?: SchematicsBlocksMapping,
    ) {
        const rawData = await SchematicLoader.load(fileUrl)
        const parsedSchematic = await SchematicLoader.parse(rawData)
        const schemBlocks: any = SchematicLoader.getBlocks(parsedSchematic)
        const dims = new Vector3(schemBlocks[0].length, schemBlocks.length, schemBlocks[0][0].length)
        const orig = new Vector3(0, 0, 0)
        const end = orig.clone().add(dims)
        const bbox = new Box3(orig, end)
        const templateChunk = new ChunkBlocksContainer(bbox)
        const missingBlockTypes: Record<string, number> = {}
        const dataType = BlockDataType.SolidBlock
        for (let y = 0; y < schemBlocks.length; y++) {
            for (let x = 0; x < schemBlocks[y].length; x++) {
                for (let z = 0; z < schemBlocks[y][x].length; z++) {
                    const [, rawType] = schemBlocks[y][x][z].name.split(':')
                    let blockType = localBlocksMapping?.[rawType] || globalBlocksMapping[rawType]
                    if (blockType === undefined) {
                        missingBlockTypes[rawType] = missingBlockTypes[rawType] || 0
                        missingBlockTypes[rawType]++
                        blockType = WorldGlobals.instance.debug.schematics.missingBlockType
                    }
                    // worldObj.rawData[index++] = blockType
                    const localPos = new Vector3(x, y, z)
                    const data: SolidBlockData = {
                        blockType,
                    }
                    const blockData: ChunkBlockData = {
                        empty: blockType === BlockType.NONE,
                        data,
                        dataType,
                    }
                    // const encodedData = ChunkFactory.defaultInstance.voxelDataEncoder(blockType || BlockType.NONE)
                    templateChunk.writeBlockData(localPos, blockData)
                }
            }
        }

        WorldGlobals.instance.debug.logs &&
            isNotWorkerEnv() &&
            Object.entries(missingBlockTypes).forEach(([type, count]) => console.warn(`missing schematic block type ${type}: ${count}`))

        // profile schematic based on its size and user profiles
        return templateChunk.toStub()
    }

    static getBlocks(schemData: any) {
        // Get dimensions of the schematic
        const width = schemData.value.Width.value
        const height = schemData.value.Height.value
        const length = schemData.value.Length.value

        // Get the palette and block data
        const palette = schemData.value.Palette.value
        const blockData = schemData.value.BlockData.value

        // Create a new 3d array
        const skippedBlocks = []
        const blocks: any = []
        for (let y = 0; y < height; y++) {
            blocks[y] = []
            for (let x = 0; x < width; x++) {
                blocks[y][x] = []
                for (let z = 0; z < length; z++) {
                    const blockId = blockData[x + z * width + y * width * length]
                    const data = this.getBlockData(palette, blockId)
                    if (data === undefined) {
                        skippedBlocks.push(blockId)
                        continue
                    }
                    blocks[y][x][z] = data
                }
            }
        }
        if (skippedBlocks.length > 0) {
            console.warn('Failed to get block data for: ' + skippedBlocks)
        }
        return blocks
    }

    static getBlockData(palette: any, blockId: number) {
        // Iterate through each key pair in the palette values
        for (const [key, value] of Object.entries(palette)) {
            if ((value as any).value === blockId) {
                // If the key contains a closing bracket, return only everything before the bracket
                if (key.includes('[')) {
                    return {
                        name: key.substring(0, key.indexOf('[')),
                        properties: key.substring(key.indexOf('[') + 1, key.indexOf(']')).split(','),
                    }
                }
                return {
                    name: key,
                }
            }
        }
        return {
            name: 'minecraft:air',
        }
    }
}
