import { Vector2, Vector3, Box3 } from 'three'

import { Block, BlockType, TerrainBlocksMapping } from '../common/types'
import * as Utils from '../common/utils'
import { LinkedList } from '../common/misc'
import { ProcGenStatsReporting } from '../tools/StatsReporting'

import { GenLayer } from './ProcGenLayer'
import { SimplexNoiseSampler } from './NoiseSampler'

export class WorldGenerator {
  // eslint-disable-next-line no-use-before-define
  static singleton: WorldGenerator
  parent: any
  samplingScale: number = 1 / 8 // 8 blocks per unit of noise
  heightScale: number = 1
  // externally provided
  terrainBlocksMapping!: LinkedList<TerrainBlocksMapping>
  procLayers!: GenLayer // 3 layers: continental, erosion, peaks => C, E, PV
  biomaps!: GenLayer // 2 layers: heatmap, rainfall => T°/H°
  layerSelection!: string
  paintingRandomness = new SimplexNoiseSampler('paintingSeed')
  seaLevel = 50
  needsRegen = false

  constructor() {
    // this.paintingRandomness.noiseParams.harmonics.period = 256
    this.paintingRandomness.params.harmonics.count = 1
    this.paintingRandomness.onChange(this)
  }

  static get instance() {
    WorldGenerator.singleton = WorldGenerator.singleton || new WorldGenerator()
    return WorldGenerator.singleton
  }

  get config() {
    return {
      selection: this.layerSelection,
      heightScale: this.heightScale,
      samplingScale: this.samplingScale,
      seaLevel: this.seaLevel,
    }
  }

  set config(config: any) {
    this.layerSelection = config.selection || this.layerSelection
    this.heightScale = !isNaN(config.heightScale)
      ? config.heightScale
      : this.heightScale
    this.samplingScale = !isNaN(config.samplingScale)
      ? config.samplingScale
      : this.samplingScale
    this.seaLevel = !isNaN(config.seaLevel) ? config.seaLevel : this.seaLevel
    this.procLayers = config.procLayers || this.procLayers

    let lay: GenLayer | undefined = this.procLayers
    while (lay) {
      // adjust height range to 255
      // (lay as ProcGenLayer).samplerProfile.multiplier = 255
      lay.parent = this
      lay = lay.next
    }
    this.biomaps = config.biomaps || this.biomaps
    // adjust temp range from 0 to 100%
    // (GenLayer.getLayer(this.biomaps, `temperature`) as ProcGenLayer).samplerProfile.multiplier = 255
    // adjust humidity range from 0 to 100%
    // (GenLayer.getLayer(this.biomaps, `temperature`) as ProcGenLayer).samplerProfile.multiplier = 100
    const {
      terrainBlocksMapping,
    }: { terrainBlocksMapping: TerrainBlocksMapping[] } = config
    if (terrainBlocksMapping) {
      this.terrainBlocksMapping = LinkedList.fromArray<TerrainBlocksMapping>(
        terrainBlocksMapping,
        (a, b) => a.threshold - b.threshold,
      )
    }
    // Object.preventExtensions(this.conf)
    // Object.assign(this.conf, config)
    // const { procgen, proclayers } = config
    this.parent?.onChange(this)
  }

  onChange(originator: any) {
    // console.debug(`[WorldGen:onChange] from ${originator}`)
    WorldGenerator.instance.needsRegen = true
    this.parent?.onChange('WorldGen:' + originator)
  }

  /**
   * 3D noise density for caverns
   */
  getDensity() {
    throw new Error('Method not implemented.')
  }

  /**
   * 2D noise for heightmap
   */
  getRawHeight(pos: Vector3) {
    const noiseScalePos = pos.multiplyScalar(this.samplingScale)
    const val =
      WorldGenerator.instance.layerSelection === 'all'
        ? // procLayers.combinedEval(samplerCoords) :
          this.procLayers.combinedWith(
            noiseScalePos,
            this.procLayers.next || this.procLayers,
            0.7,
          )
        : // procLayers.modulatedBy(samplerCoords, procLayers.next, 0.7) :
          GenLayer.getLayer(
            this.procLayers,
            WorldGenerator.instance.layerSelection,
          ).eval(noiseScalePos)
    return val * 255
  }

  /**
   * Overall height (ground + water)
   */
  getHeight(pos: Vector3) {
    const rawHeight = this.getRawHeight(pos)
    return Math.max(rawHeight, this.seaLevel)
  }

  getTemperature(pos: Vector3) {
    const scaledNoisePos = pos.multiplyScalar(this.samplingScale)
    const val = GenLayer.getLayer(this.biomaps, 'temperature').eval(
      scaledNoisePos,
    )
    return val * 100 - 50
  }

  getHumidity(pos: Vector3) {
    const scaledNoisePos = pos.multiplyScalar(this.samplingScale)
    const val = GenLayer.getLayer(this.biomaps, 'humidity').eval(scaledNoisePos)
    return val
  }

  /**
   * How far inland + terrain shape for: ocean, beach, riff, prairies
   * depending on erosion modulation can produce hilly prairies variant
   * The higher values are placeholder for Peaks&Valleys
   */
  getContinentalness = (pos: Vector3) => {
    const scaledPos = pos.clone().multiplyScalar(this.samplingScale)
    return GenLayer.getLayerAtIndex(this.procLayers, 0).rawEval(scaledPos)
  }

  /**
   * Higher density noise to make rougher terrain with quick variation
   * depending on erosion modulation can produce
   * - mountains, peaks
   * - highlands
   */
  getPeaksValleys = (pos: Vector3) => {
    const scaledPos = pos.clone().multiplyScalar(this.samplingScale)
    return GenLayer.getLayerAtIndex(this.procLayers, 2).rawEval(scaledPos)
  }

  /**
   * Modulates terrain amplitude for:
   * - continentalness only after prairies
   * - peaks only for higher errosion
   * low erosion : high amplitude
   * high erosion: low amplitude
   */
  getErosion = (pos: Vector3) => {
    const scaledPos = pos.clone().multiplyScalar(this.samplingScale)
    return GenLayer.getLayerAtIndex(this.procLayers, 1).rawEval(scaledPos)
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
    const { x, y, z } = block
    const period = 0.005 * Math.pow(2, 2)
    const baseHeight = y
    let current = this.terrainBlocksMapping
    let previous = this.terrainBlocksMapping
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
    if (
      baseHeight - bounds.lower <= bounds.upper - baseHeight &&
      baseHeight - randomness.low < bounds.lower
    ) {
      const groundPos = new Vector2(x, z).multiplyScalar(period)
      const heightVariation =
        this.paintingRandomness.eval(groundPos) * randomness.low
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
        this.paintingRandomness.eval(groundPos) * randomness.high
      const varyingHeight = baseHeight + heightVariation
      blockType =
        varyingHeight > next.data.threshold
          ? next.data.blockType
          : current.data.blockType
    }

    return blockType
  }

  /**
   * Determine block's existence based on density value evaluated at block position
   * @param position block position where density is evaluated
   * @returns existing block or null if empty
   */
  getBlock(pos: Vector3): BlockType {
    // eval density at block position
    const density = this.getHeight(pos) // TODO replace by real density val
    // determine if block is empty or not based on density val being above or below threshold
    const blockExists = pos.y <= density
    return blockExists ? this.getBlockType(pos) : BlockType.NONE
  }

  /**
   * Heightmap patch mode
   * @param bbox
   */
  // *generatePatch(bbox: Box3): Generator<Block, void, unknown> {
  //   //TODO
  // }

  /**
   * Chunk mode
   * on-the-fly generation suitable for voxels volume rendering
   * @param bbox
   * @param pruning optional hidden blocks pruning
   */
  *generateChunk(bbox: Box3, pruning = false): Generator<Block, void, unknown> {
    // Gen stats
    let iterCount = 0
    let blocksCount = 0
    // const blocksLevels = {
    //   avg: 0,
    //   min: 0,
    //   max: 0
    // }
    const startTime = Date.now()
    const { seaLevel } = this
    // sampling volume
    for (let { x } = bbox.min; x < bbox.max.x; x++) {
      for (let { z } = bbox.min; z < bbox.max.z; z++) {
        // starting from the top of voxels' column
        let y = bbox.max.y - 1
        // optim for heightmap only: stop at first hidden block encountered
        let hidden = false
        const groundLevel = this.getHeight(new Vector3(x, y, z))
        // for (let y = bbox.max.y - 1; y >= bbox.min.y; y--) {
        while (!hidden && y >= bbox.min.y) {
          const blockPos = new Vector3(x, y, z)
          const blockType =
            blockPos.y < Math.max(groundLevel, seaLevel)
              ? this.getBlockType(blockPos)
              : BlockType.NONE
          const block: Block = { pos: blockPos, type: blockType }
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
          y--
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
   * @param bbox
   * @returns
   */
  estimatedVoxelsCount(bbox: Box3): number {
    const range = bbox.getSize(new Vector3())
    return range.x * range.z * 2
  }
}
