import { Box2, Box3, Vector2, Vector3 } from 'three'

import { ChunkContainer } from '../datacontainers/ChunkContainer'
import { PatchStub } from '../datacontainers/PatchBase'
import { DistributionProfiles } from './RandomDistributionMap'
import { Biome, BlocksBatch, DistributionProfile, PseudoDistributionMap, WorldComputeProxy, WorldProcessing, WorldUtils } from '../index'
import { DistributionParams } from '../procgen/BlueNoisePattern'
import { ProceduralItemGenerator } from '../tools/ProceduralGenerators'
import { SchematicLoader } from '../tools/SchematicLoader'
import { asPatchBounds, asBox3, asBox2, asVect2, asVect3, parsePatchKey } from '../utils/convert'
import { PatchKey, ProcessType } from '../utils/types'

import { WorldEnv } from '../config/WorldEnv'
import { GroundPatch } from './GroundPatch'

export type ItemType = string
export type SpawnedItems = Record<ItemType, Vector3[]>

/**
 * Referencing all items either procedurally generated or coming from schematic definitions 
 */
// rename as ItemsFactory ?
export class ItemsInventory {
  // TODO rename catalog as inventory
  static catalog: Record<ItemType, ChunkContainer> = {}
  static get externalSources() {
    const schematicsFilesIndex = WorldEnv.current.schematics.filesIndex
    const proceduralItemsConfigs = WorldEnv.current.proceduralItems.configs
    return { schematicsFilesIndex, proceduralItemsConfigs }
  }

  static get schematicFilesIndex() {
    return WorldEnv.current.schematics.filesIndex
  }

  static get proceduralItemsConf() {
    return WorldEnv.current.proceduralItems.configs
  }

  // static spawners: Record<ItemType, PseudoDistributionMap> = {}
  /**
   * Populate from schematics
   * @param schematicFileUrls
   * @param optionalDataEncoder
   */
  static async importSchematic(id: ItemType) {
    const fileUrl = ItemsInventory.schematicFilesIndex[id]
    let chunk
    if (fileUrl) {
      const customBlocksMapping =
        WorldEnv.current.schematics.localBlocksMapping[id]
      chunk = await SchematicLoader.createChunkContainer(
        fileUrl,
        customBlocksMapping,
      )
      // const spawner = new PseudoDistributionMap()
      ItemsInventory.catalog[id] = chunk
    }
    return chunk
  }

  static importProcItem(id: ItemType) {
    const procConf = ItemsInventory.proceduralItemsConf[id]
    let chunk
    if (procConf) {
      chunk = ProceduralItemGenerator.voxelizeItem(
        procConf.category,
        procConf.params,
      )
      // const spawner = new PseudoDistributionMap()
      if (chunk) {
        ItemsInventory.catalog[id] = chunk
      }
    }
    return chunk
  }

  static async getTemplateChunk(itemId: string) {
    return (
      this.catalog[itemId] ||
      (await this.importSchematic(itemId)) ||
      this.importProcItem(itemId)
    )
  }

  static async getInstancedChunk(itemType: ItemType, itemPos: Vector3) {
    let itemChunk: ChunkContainer | undefined
    const templateChunk = await this.getTemplateChunk(itemType)
    if (templateChunk) {
      const dims = templateChunk.bounds.getSize(new Vector3())
      // const translation = parseThreeStub(spawnLoc).sub(new Vector3(dims.x / 2, 0, dims.z / 2).round())
      // const entityBounds = entity.template.bounds.clone().translate(translation)
      const entityBounds = new Box3().setFromCenterAndSize(itemPos, dims)
      entityBounds.min.y = itemPos.y
      entityBounds.max.y = itemPos.y + dims.y
      entityBounds.min.floor()
      entityBounds.max.floor()
      itemChunk = new ChunkContainer(entityBounds, 0)
      itemChunk.rawData.set(templateChunk.rawData)
    }
    return itemChunk
  }
}


const defaultDistribution: DistributionParams = {
  ...DistributionProfiles[DistributionProfile.MEDIUM],
  minDistance: 10,
}
const defaultSpawnMap = new PseudoDistributionMap(
  undefined,
  defaultDistribution,
)
const defaultItemDims = new Vector3(10, 13, 10)

type ItemsLayerStub = {
  spawnedItems: SpawnedItems,
  individualChunks: ChunkContainer[]
}

export enum ItemsProcessMode {
  NONE,
  INDIVIDUAL,
  MERGED
}

export type ItemsProcessingParams = {
  mode: ItemsProcessMode
}

const defaultProcessingParams: ItemsProcessingParams = {
  mode: ItemsProcessMode.INDIVIDUAL
}

/**
 * Process all items found in given patch
 * rename as ItemsProcessing?
 */
export class ItemsChunkLayer extends WorldProcessing {
  bounds: Box3
  patch: PatchStub = {
    bounds: new Box2,
  }
  spawnedItems: SpawnedItems = {}
  individualChunks: ChunkContainer[] = []

  constructor(boundsOrPatchKey: Box2 | PatchKey) {
    super()
    const patchBounds =
      boundsOrPatchKey instanceof Box2
        ? boundsOrPatchKey.clone()
        : asPatchBounds(boundsOrPatchKey, WorldEnv.current.patchDimensions)
    this.bounds = asBox3(patchBounds)
    this.patch.bounds = patchBounds
    if (typeof boundsOrPatchKey === 'string') {
      this.patchKey = boundsOrPatchKey
    }
  }

  get patchKey() {
    return this.patch.key || ''
  }

  set patchKey(patchKey: string) {
    this.patch.key = patchKey
    this.patch.id = parsePatchKey(patchKey) as Vector2
  }

  get patchId() {
    return this.patch.id
  }

  override async delegate(processingParams = defaultProcessingParams, processingUnit = WorldComputeProxy.workerPool) {
    // super.delegate(processingParams, processingUnit)
    await processingUnit
      .exec(ProcessType.ItemsLayer, [this.patch.key || this.patchBounds, processingParams])
      .then((stub: ItemsLayerStub) => {
        // fill object from worker's data
        this.spawnedItems = stub.spawnedItems
        this.individualChunks = stub.individualChunks || this.individualChunks
      })
  }

  override async process(processingParams = defaultProcessingParams) {
    const { mode } = processingParams
    this.retrieveOvergroundItems()
    switch (mode) {
      case ItemsProcessMode.INDIVIDUAL:
        await this.bakeIndividualChunks()
        break;
      case ItemsProcessMode.MERGED:
        await this.bakeIndividualChunks()
        const mergeChunk = await this.mergeIndividualChunks()
        return mergeChunk
      default:
    }
  }

  toStub() {
    const { spawnedItems, individualChunks } = this
    // return { spawnedItems, individualChunks }
    return { spawnedItems }
  }

  get patchBounds() {
    return asBox2(this.bounds)
  }

  get spawnedLocs() {
    const spawnedLocs = []
    for (const [, spawnPlaces] of Object.entries(this.spawnedItems)) {
      spawnedLocs.push(...spawnPlaces)
    }
    return spawnedLocs
  }

  retrieveOvergroundItems() {
    const groundPatch = new GroundPatch(this.patchBounds)
    groundPatch.preprocess()

    const spawnedItems: Record<ItemType, Vector3[]> = {}
    const spawnPlaces = defaultSpawnMap.querySpawnLocations(
      this.patchBounds,
      asVect2(defaultItemDims),
    )
    for (const pos of spawnPlaces) {
      const { level, biome, landscapeIndex } = groundPatch.computeGroundBlock(asVect3(pos))
      const weightedItems =
        Biome.instance.mappings[biome]?.nth(landscapeIndex)?.data?.flora
      if (weightedItems) {
        const spawnableTypes: ItemType[] = []
        Object.entries(weightedItems).forEach(([itemType, spawnWeight]) => {
          while (spawnWeight > 0) {
            spawnableTypes.push(itemType)
            spawnWeight--
          }
        })
        const itemType = defaultSpawnMap.getSpawnedItem(
          pos,
          spawnableTypes,
        ) as ItemType
        if (itemType) {
          spawnedItems[itemType] = spawnedItems[itemType] || []
          spawnedItems[itemType]?.push(asVect3(pos, level))
        }
      }
    }
    this.spawnedItems = spawnedItems
  }

  async bakeIndividualChunks() {
    // request all items belonging to this patch
    const individualChunks = []
    let ymin = NaN
    let ymax = NaN // compute y range
    for await (const [itemType, spawnPlaces] of Object.entries(
      this.spawnedItems,
    )) {
      for await (const spawnOrigin of spawnPlaces) {
        const itemChunk = await ItemsInventory.getInstancedChunk(
          itemType,
          spawnOrigin,
        )
        if (itemChunk) {
          // ChunkContainer.copySourceToTarget(itemChunk, this)
          const { min, max } = itemChunk.bounds
          ymin = isNaN(ymin) ? min.y : Math.min(ymin, min.y)
          ymax = isNaN(ymax) ? max.y : Math.max(ymax, max.y)
          const chunkBottomBlocks: Vector2[] = []
          // iter slice blocks
          for (const heightBuff of itemChunk.iterChunkSlice()) {
            if (heightBuff.data[0]) chunkBottomBlocks.push(heightBuff.pos)
          }
          // compute blocks batch to find lowest element
          const blocksBatch = new BlocksBatch(chunkBottomBlocks) //await BlocksBatch.proxyGen(chunkBottomBlocks)
          await blocksBatch.process()
          const [lowestBlock] = blocksBatch.output.sort(
            (b1, b2) => b1.data.level - b2.data.level,
          )
          const lowestLevel = lowestBlock?.data.level || 0
          const yOffset = itemChunk.bounds.min.y - lowestLevel
          const offset = new Vector3(0, -yOffset, 0)
          // adjust chunk elevation according to lowest element
          itemChunk.bounds.translate(offset)
          individualChunks.push(itemChunk)
        }
      }
    }
    this.bounds.min.y = ymin
    this.bounds.max.y = ymax
    this.individualChunks = individualChunks
  }

  mergeIndividualChunks() {
    const mergeChunkBounds = new Box3()
    for (const itemChunk of this.individualChunks) {
      mergeChunkBounds.union(itemChunk?.bounds)
    }
    const mergeChunk = new ChunkContainer(mergeChunkBounds, 1)
    for (const itemChunk of this.individualChunks) {
      ChunkContainer.copySourceToTarget(itemChunk, mergeChunk)
    }
    return mergeChunk
  }
}

WorldProcessing.registeredObjects[ItemsChunkLayer.name] = ItemsChunkLayer