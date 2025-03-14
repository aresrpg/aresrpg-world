import { WorldLocals, WorldLocalSettings } from './config/WorldEnv.js'
import { ItemsInventory } from './factory/ItemsFactory.js'
import { Biome } from './procgen/Biome.js'
import { DensityVolume } from './procgen/DensityVolume.js'
import { Heightmap } from './procgen/Heightmap.js'

/**
 * All world modules required to compute world objects
 * or WorldModules
 */
export class WorldModules {
  // static defaultInstance: WorldContext
  worldLocalEnv: WorldLocals
  biome: Biome
  heightmap: Heightmap
  densityVolume: DensityVolume
  itemsInventory: ItemsInventory

  constructor(worldLocalSettings: WorldLocalSettings) {
    this.worldLocalEnv = new WorldLocals().fromStub(worldLocalSettings)
    const worldSeeds = this.worldLocalEnv.rawSettings.seeds
    this.biome = new Biome(this.worldLocalEnv.getBiomeEnv(), worldSeeds)
    this.heightmap = new Heightmap(
      this.biome,
      this.worldLocalEnv.getHeightmapEnv(),
      worldSeeds,
    )
    this.densityVolume = new DensityVolume(worldSeeds)
    this.itemsInventory = new ItemsInventory(this.worldLocalEnv.getItemsEnv())
    console.log('world modules initialized')
  }
}
