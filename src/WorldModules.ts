import {
  WorldEnv,
  WorldEnvSettings,
  WorldIndividualSeeds,
} from './config/WorldEnv.js'
import { Biome } from './procgen/Biome.js'
import { DensityVolume } from './procgen/DensityVolume.js'
import { Heightmap } from './procgen/Heightmap.js'

/**
 * All world modules required to compute world objects
 * or WorldModules
 */
export class WorldModules {
  // static defaultInstance: WorldContext
  worldEnv: WorldEnv
  biome: Biome
  heightmap: Heightmap
  densityVolume: DensityVolume

  constructor(worldEnvSettings: WorldEnvSettings) {
    this.biome = new Biome(worldEnvSettings.biomes)
    this.heightmap = new Heightmap(this.biome, worldEnvSettings.heightmap)
    this.densityVolume = new DensityVolume()
    this.worldEnv = new WorldEnv().fromStub(worldEnvSettings)
    this.applyIndividualSeeds(worldEnvSettings.seeds.overrides)
    console.log('world modules initialized')
  }

  applyIndividualSeeds(customSeeds: WorldIndividualSeeds) {
    if (Object.keys(customSeeds).length > 0) {
      // console.log(`apply custom seeds: `, customSeeds)
      const {
        heightmap: heightmapInstance,
        biome: biomeInstance,
        densityVolume,
      } = this
      heightmapInstance.heightmap.sampling.seed = customSeeds.heightmap
      heightmapInstance.amplitude.sampling.seed = customSeeds.amplitude
      biomeInstance.heatmap.sampling.seed = customSeeds.heatmap
      biomeInstance.rainmap.sampling.seed = customSeeds.rainmap
      biomeInstance.posRandomizer.sampling.seed = customSeeds.randompos
      densityVolume.densityNoise.seed = customSeeds.density
    }
  }
}
