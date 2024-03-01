import { AresRpgEngine } from "aresrpg-engine";
import { Color } from "three";

enum EVoxelType {
    ROCK,
    GRASS,
    SNOW,
    WATER,
    SAND,
}

const VOXEL_TYPE_COLORS: Record<EVoxelType, AresRpgEngine.IVoxelMaterial> = [
    { color: new Color("#ABABAB") },
    { color: new Color("#00B920") },
    { color: new Color("#E5E5E5") },
    { color: new Color("#0055E2") },
    { color: new Color("#DCBE28") },
];

export { EVoxelType, VOXEL_TYPE_COLORS }