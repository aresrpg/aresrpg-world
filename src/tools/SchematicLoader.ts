import { NBTReader } from "../third-party/nbt";
import Pako from "pako"
import { Box3, Vector3 } from "three";
import { BlockType } from "../procgen/Biome";
import { ChunkContainer } from "../datacontainers/ChunkContainer";
import { WorldConf } from "../misc/WorldConfig";

export class SchematicLoader {
    static worldBlocksMapping: Record<string, BlockType>

    static async load(path: string) {
        // const schem = await Schematic.read(Buffer.from(schemData), '1.16.4')
        const res = await fetch(path);
        console.log(res);
        const blob = await res.blob();
        const rawData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (event) {
                const blobData = event?.target?.result as ArrayBuffer
                blobData && resolve(Pako.inflate(blobData))
            }
            reader.readAsArrayBuffer(blob);
        })
        return rawData
    }

    static async parse(rawData) {
        return new Promise((resolve, reject) => {
            NBTReader.parse(rawData, function (error, data) {
                if (error) { throw error; }
                resolve(data);
            });
        });
    }

    /**
     * convert schematic format to world object
     * @param schemBlocks 
     * @returns 
     */
    static async createChunkContainer(fileUrl: string, chunkDataEncoder = (val: BlockType) => val) {
        const rawData = await SchematicLoader.load(fileUrl)
        const parsedSchematic = await SchematicLoader.parse(rawData)
        const schemBlocks = SchematicLoader.getBlocks(parsedSchematic)
        const dims = new Vector3(schemBlocks[0].length, schemBlocks.length, schemBlocks[0][0].length)
        const orig = new Vector3(0, 0, 0)
        const end = orig.clone().add(dims)
        const bbox = new Box3(orig, end)
        const chunkContainer = new ChunkContainer(bbox)

        for (let y = 0; y < schemBlocks.length; y++) {
            for (let x = 0; x < schemBlocks[y].length; x++) {
                for (let z = 0; z < schemBlocks[y][x].length; z++) {
                    const rawType = schemBlocks[y][x][z].name.split(":")[1]
                    let blockType = this.worldBlocksMapping[rawType]
                    if (blockType === undefined) {
                        console.warn(`missing schematic block type ${rawType}`)
                        blockType = WorldConf.debug.schematics.missingBlockType
                    }
                    // worldObj.rawData[index++] = blockType
                    const localPos = new Vector3(x, y, z)
                    const blockIndex = chunkContainer.getIndex(localPos)
                    // const encodedData = ChunkFactory.defaultInstance.voxelDataEncoder(blockType || BlockType.NONE)
                    chunkContainer.rawData[blockIndex] = chunkDataEncoder(blockType || BlockType.NONE) //encodedData
                }
            }
        }
        return chunkContainer
    }

    static getBlocks(schemData) {
        // Get dimensions of the schematic
        const width = schemData.value.Width.value;
        const height = schemData.value.Height.value;
        const length = schemData.value.Length.value;

        // Get the palette and block data
        const palette = schemData.value.Palette.value;
        const blockData = schemData.value.BlockData.value;

        // Create a new 3d array
        let skippedBlocks = [];
        let blocks = [];
        for (let y = 0; y < height; y++) {
            blocks[y] = [];
            for (let x = 0; x < width; x++) {
                blocks[y][x] = [];
                for (let z = 0; z < length; z++) {
                    const blockId = blockData[x + z * width + y * width * length];
                    const data = this.getBlockData(palette, blockId);
                    if (data === undefined) {
                        skippedBlocks.push(blockId);
                        continue;
                    }
                    blocks[y][x][z] = data;
                }
            }
        }
        if (skippedBlocks.length > 0) {
            console.warn("Failed to get block data for: " + skippedBlocks);
        }
        return blocks;
    }

    static getBlockData(palette, blockId) {
        // Iterate through each key pair in the palette values
        for (const [key, value] of Object.entries(palette)) {
            if (value.value === blockId) {
                // If the key contains a closing bracket, return only everything before the bracket
                if (key.includes("[")) {
                    return {
                        name: key.substring(0, key.indexOf("[")),
                        properties: key.substring(key.indexOf("[") + 1, key.indexOf("]")).split(",")
                    };
                }
                return {
                    name: key,
                };
            }
        }
        return {
            name: "minecraft:air",
        };
    }
}