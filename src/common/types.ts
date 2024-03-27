import { IVoxelMaterial } from '@aresrpg/aresrpg-engine'
import { Color } from 'three'

enum VoxelType {
  ROCK,
  GRASS,
  SNOW,
  WATER,
  SAND,
}

const VOXEL_TYPE_COLORS: Record<VoxelType, IVoxelMaterial> = [
  { color: new Color('#ABABAB') },
  { color: new Color('#00B920') },
  { color: new Color('#E5E5E5') },
  { color: new Color('#0055E2') },
  { color: new Color('#DCBE28') },
]

export { VoxelType, VOXEL_TYPE_COLORS }
