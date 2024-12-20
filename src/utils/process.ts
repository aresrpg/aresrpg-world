import { Vector2, Box2 } from 'three'

import { WorldEnv } from '../index'
import { BiomeInfluence, PatchBoundingBiomes } from '../procgen/Biome'

import { bilinearInterpolation } from './math'
import { PatchBoundId } from './types'

export const getBlockBiome = (
  blockPos: Vector2,
  patchBounds: Box2,
  boundingBiomes: BiomeInfluence | PatchBoundingBiomes,
) => {
  if (
    (boundingBiomes as PatchBoundingBiomes)[PatchBoundId.xMyM] &&
    WorldEnv.current.settings.useBiomeBilinearInterpolation
  ) {
    return bilinearInterpolation(
      blockPos,
      patchBounds,
      boundingBiomes as PatchBoundingBiomes,
    ) as BiomeInfluence
  }
  return boundingBiomes as BiomeInfluence
}
