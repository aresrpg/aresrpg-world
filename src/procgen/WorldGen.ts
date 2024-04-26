import { Vector2, Vector3, Box3 } from 'three'

import { Block, BlockType, TerrainBlocksMapping } from '../common/types'
import * as Utils from '../common/utils'
import { LinkedList } from '../common/misc'
import { ProcGenStatsReporting } from '../tools/StatsReporting'

import { EvalMode, ProcGenLayer } from './ProcGenLayer'

export enum MapType {
  Default = "default",
  Heightmap = "heightmap",
  Amplitude = "amplitude",
  Heatmap = "heatmap",
  Rainfall = "rainfall",
  Treemap = "treemap",
  PaintRandomness = "paintrandom"
}

/**
 * # Generation modes
 * 
 * - genHeightmapChunk: voxels heightmap for terrain
 * - genVolumetricChunk: volumetric voxels for caverns 
 * - genPatch: regular heightmap
 * 
 * # Procedural layers
 * 
 * ## Terrain maps
 *  - Heighmap: terrain elevation with threshold for ocean, beach, riff, prairies, ..
 *  Specifies overall terrain shape and how far inland.
 * - Amplitude modulation (or erosion)
 * modulating terrain amplitude, to produce variants like hilly prairies, ..
 * - ?: higher density noise to make rougher terrain with quick variation (TODO)
 * 
 * ## Biome maps
 * - Rainfall
 * - Heatmap
 * - Treemap
 *  
 */

export class WorldGenerator {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldGenerator
  parent: any
  needsRegen = false
  params = {
    heightScale: 1,
    samplingScale: 1 / 8, // default: 8 blocks per unit of noise
    seaLevel: 50,
    mode: EvalMode.Default
  }
  selectedLayer = MapType.Default // used for individual layer preview
  // externally provided maps
  procLayers!: ProcGenLayer[] // all proc layers
  terrainLayers!: LinkedList<ProcGenLayer> // terrain: elevation, amplitude
  blocksMap!: LinkedList<TerrainBlocksMapping>  // terrain types: water, sand, grass, mud, rock, snow, ..

  static get instance() {
    WorldGenerator.singleton = WorldGenerator.singleton || new WorldGenerator()
    return WorldGenerator.singleton
  }

  findProcLayer(layerName: string) {
    return this.procLayers.find(layer => layer.name === layerName)
  }

  initProcLayers(procLayers: ProcGenLayer[]) {
    procLayers.forEach(layer => {
      layer.parent = this
    })
    this.procLayers = procLayers
  }

  initBlocksMap(blocksMapping: TerrainBlocksMapping[]) {
    this.blocksMap = LinkedList.fromArraWithSorting<TerrainBlocksMapping>(
      blocksMapping,
      (a, b) => a.threshold - b.threshold,
    )
  }

  /**
   * 3D noise density for caverns
   * Determine block's existence based on density value evaluated at block position
   * @param position block position where density is evaluated
   */
  getVolumetricDensity() {
    throw new Error('Method not implemented.')
  }

  /**
   * EvalMode:
   * - raw: noise value
   * - profile: value after applying profile to map noise
   * - profile_low: 
   * - profile_up:
   */
  getHeight(pos: Vector3, evalMode: EvalMode = this.evalMode) {
    const { samplingScale } = this.params
    const mapCoords = pos.clone().multiplyScalar(samplingScale)
    const currentLayer = this.findProcLayer(this.selectedMap === MapType.Default ? MapType.Heightmap : this.selectedMap)
    const amplitudeLayer = (this.findProcLayer(MapType.Amplitude) as ProcGenLayer)
    const rawVal = this.selectedMap === MapType.Default ? currentLayer?.modulatedBy(mapCoords, amplitudeLayer, 0.318) :
      currentLayer?.eval(mapCoords, evalMode)
    return rawVal ? rawVal * 255 : 0
  }

  getTemperature(pos: Vector3) {
    const scaledNoisePos = pos.clone().multiplyScalar(this.params.samplingScale)
    const heatmap = this.findProcLayer(MapType.Heatmap)
    const val = heatmap?.eval(scaledNoisePos)
    return val ? val * 100 - 50 : NaN
  }

  getHumidity(pos: Vector3) {
    const scaledNoisePos = pos.clone().multiplyScalar(this.params.samplingScale)
    const rainfallmap = this.findProcLayer(MapType.Rainfall)
    return rainfallmap?.eval(scaledNoisePos) || NaN
  }

  /**
   * Checking neighbours surrounding block's position
   * to determine if block is hidden or not
   */
  hiddenBlock(position: Vector3) {
    const adjacentNeighbours = Utils.AdjacentNeighbours.map(adj =>
      Utils.getNeighbour(position, adj),
    )
    const neighbours = adjacentNeighbours.filter(adjPos => {
      const groundLevel = this.getHeight(adjPos)
      return adjPos.y <= groundLevel
    })
    return neighbours.length === 6
  }

  getBlockType = (block: Vector3) => {
    const paintingRandomness = this.findProcLayer(MapType.PaintRandomness)
    const { x, y, z } = block
    const period = 0.005 * Math.pow(2, 2)
    const baseHeight = y
    let current = this.blocksMap
    let previous = this.blocksMap
    while (current.next && baseHeight > current.next.data.threshold) {
      previous = current
      current = current.next
    }
    const { next } = current
    // add some height variations to break painting monotony
    const { randomness } = current.data
    const bounds = {
      lower: current.data.threshold,
      upper: next?.data.threshold || 1,
    }
    // nominal type
    let { blockType } = current.data
    // randomize on lower side
    if (!paintingRandomness) {
      return blockType
    } else if (
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - randomness.low < bounds.lower
    ) {
      const groundPos = new Vector2(x, z).multiplyScalar(period)
      const heightVariation =
        paintingRandomness.eval(groundPos) * randomness.low
      const varyingHeight = baseHeight - heightVariation
      blockType =
        varyingHeight < current.data.threshold
          ? previous.data.blockType
          : current.data.blockType
    }
    // randomize on upper side
    else if (baseHeight + randomness.high > bounds.upper && next) {
      const groundPos = new Vector2(x, z).multiplyScalar(period)
      //   let heightVariation =
      //   Utils.clamp(this.paintingRandomness.eval(groundPos), 0.5, 1) * randomness.high
      // heightVariation = heightVariation > 0 ? (heightVariation - 0.5) * 2 : 0
      const heightVariation =
        paintingRandomness.eval(groundPos) * randomness.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > next.data.threshold
          ? next.data.blockType
          : current.data.blockType
    }

    return blockType
  }

  /**
   * Voxels on-the-fly generation for terrain
   * @param bbox 
   * @param pruning optionaly prune hidden voxels
   */
  *genHeightmapChunk(bbox: Box3, includeSea = false, pruning = false): Generator<Block, void, unknown> {
    // Gen stats
    let iterCount = 0
    let blocksCount = 0
    // const blocksLevels = {
    //   avg: 0,
    //   min: 0,
    //   max: 0
    // }
    const startTime = Date.now()
    const { seaLevel } = this.params

    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        // starting from the top of voxels' column
        const blockPos = new Vector3(x, bbox.max.y - 1, z)
        // optim for heightmap only: stop at first hidden block encountered
        let hidden = false
        const groundLevel = this.getHeight(blockPos)
        let height = includeSea ? Math.max(groundLevel, seaLevel) : groundLevel
        while (!hidden && blockPos.y >= bbox.min.y) {
          const blockType = blockPos.y < height ?
            this.getBlockType(blockPos) :
            BlockType.NONE
          const block: Block = { pos: blockPos.clone(), type: blockType }
          hidden =
            pruning &&
            block.type !== BlockType.NONE &&
            this.hiddenBlock(block.pos)
          // only existing and visible block, e.g with a face in contact with air
          if (block.type !== BlockType.NONE && !hidden) {
            yield block
            blocksCount++
          }
          iterCount++
          blockPos.y--
        }
      }
    }
    const elapsedTime = Date.now() - startTime
    const genStats = {
      time: elapsedTime,
      blocks: blocksCount,
      iterations: iterCount,
    }
    ProcGenStatsReporting.instance.worldGen = genStats
    // ProcGenStatsReporting.instance.printGenStats(genStats)
  }

  /**
   * Voxels volume on-the-fly generation for caverns
   * @param bbox
   * @param pruning optionaly prune hidden voxels
   */
  // *genVolumetricChunk(bbox: Box3, pruning = false): Generator<Block, void, unknown> {
  // }

  /**
  * Regular heightmap patch
  * @param bbox
  */
  // *genPatch(bbox: Box3): Generator<Block, void, unknown> {
  // }

  get selectedMap() {
    return this.selectedLayer
  }

  set selectedMap(mapType: MapType) {
    this.selectedLayer = mapType
    this.onChange(`selectedLayer`)
  }

  get evalMode() {
    return this.params.mode
  }

  set evalMode(evalMode) {
    this.params.mode = evalMode
    this.onChange(`evalMode`)
  }

  /**
   * @param bbox
   * @returns
   */
  estimatedVoxelsCount(bbox: Box3): number {
    const range = bbox.getSize(new Vector3())
    return range.x * range.z * 2
  }

  onChange(originator: any) {
    // console.debug(`[WorldGen:onChange] from ${originator}`)
    WorldGenerator.instance.needsRegen = true
    this.parent?.onChange('WorldGen:' + originator)
  }
}
