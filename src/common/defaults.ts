import { VoxelType } from './types'

const DEFAULT_VOXEL_TYPES_MAPPING = (height: number) => {
  if (height < 10) return VoxelType.WATER
  else if (height < 20) return VoxelType.SAND
  else if (height < 60) return VoxelType.GRASS
  else if (height < 100) return VoxelType.ROCK
  return VoxelType.SNOW
}

export { DEFAULT_VOXEL_TYPES_MAPPING }
