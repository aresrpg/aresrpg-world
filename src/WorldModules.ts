import { WorldEnvSettings, WorldIndividualSeeds } from './config/WorldEnv.js'
import { Biome } from './procgen/Biome.js'
import { Heightmap } from './procgen/Heightmap.js'

/**
 * All world modules required to compute world objects
 * or WorldModules
 */
export class WorldModules {
  // static defaultInstance: WorldContext
  biome: Biome
  heightmap: Heightmap

  constructor(worldEnvSettings: WorldEnvSettings) {
    this.biome = new Biome(worldEnvSettings.biomes.rawConf)
    this.heightmap = new Heightmap(this.biome)
    this.applyIndividualSeeds(worldEnvSettings.seeds.overrides)
    console.log('world modules initialized')
  }

  applyIndividualSeeds(customSeeds: WorldIndividualSeeds) {
    if (Object.keys(customSeeds).length > 0) {
      // console.log(`apply custom seeds: `, customSeeds)
      const { heightmap: heightmapInstance, biome: biomeInstance } = this
      heightmapInstance.heightmap.sampling.seed = customSeeds.heightmap
      heightmapInstance.amplitude.sampling.seed = customSeeds.amplitude
      biomeInstance.heatmap.sampling.seed = customSeeds.heatmap
      biomeInstance.rainmap.sampling.seed = customSeeds.rainmap
      biomeInstance.posRandomizer.sampling.seed = customSeeds.randompos
      // DensityVolume.instance.densityNoise.seed = customSeeds.density
    }
  }
}
