// import { MathUtils, Vector3 } from 'three'
import { Vector3 } from 'three'
import { asVect2, serializePatchId, asBox2 } from '../utils/patch_chunk'
import { ChunkKey, PatchBlock } from '../utils/common_types'
import {
  ChunkBuffer,
  ChunkContainer,
  ChunkMask,
} from '../datacontainers/ChunkContainer'
import { GroundPatch } from '../processing/GroundPatch'
import { clamp } from '../utils/math_utils'
import { worldRootEnv } from '../config/WorldEnv'
import { Biome, BiomeType, BlockType } from '../procgen/Biome'
import { DensityVolume } from '../procgen/DensityVolume'

export class EmptyChunk extends ChunkContainer {
  constructor(chunkKey: ChunkKey) {
    super(chunkKey, 1)
    this.rawData = new Uint16Array()
  }

  async bake() { }
}

const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  const { borderHighlightColor } = worldRootEnv.rawSettings.debug.patch
  return borderHighlightColor && (localPos.x === 1 || localPos.z === 1)
    ? borderHighlightColor
    : blockType
}

export class GroundChunk extends ChunkContainer {
  generateGroundBuffer(block: PatchBlock, ymin: number, ymax: number) {
    //, isTransition = false) {
    const undegroundDepth = 4
    const { biome, landIndex } = block.data
    const blockLocalPos = block.localPos as Vector3
    const biomeLand = Biome.instance.mappings[biome].nth(landIndex)
    const landConf = biomeLand.data
    const blockType = // isTransition ? BlockType.SAND :
      highlightPatchBorders(blockLocalPos, landConf.type) || landConf.type
    // const groundFlags = parseGroundFlags(flags)
    // const blockMode = groundFlags.boardMode
    //   ? BlockMode.CHECKERBOARD
    //   : BlockMode.REGULAR
    const groundSurface = blockType //this.dataEncoder(blockType, blockMode)
    const undergroundLayer = landConf.subtype || BlockType.BEDROCK //this.dataEncoder(landConf.subtype || BlockType.BEDROCK)
    // generate ground buffer
    const buffSize = clamp(block.data.level - ymin, 0, ymax - ymin)
    if (buffSize > 0) {
      const groundBuffer = new Uint16Array(block.data.level - ymin)
      // fill with bedrock first
      groundBuffer.fill(biome === BiomeType.Arctic ? BlockType.ICE : BlockType.BEDROCK)
      // add underground layer
      groundBuffer.fill(
        undergroundLayer,
        groundBuffer.length - (undegroundDepth + 1),
      )
      // finish with ground surface block
      groundBuffer[groundBuffer.length - 1] = groundSurface
      const chunkBuffer: ChunkBuffer = {
        pos: asVect2(blockLocalPos),
        content: groundBuffer.slice(0, buffSize),
      }
      return chunkBuffer
    }
    return undefined
  }

  async bake(groundLayer?: GroundPatch, cavesMask?: ChunkMask) {
    const patchId = asVect2(this.chunkId as Vector3)
    const patchKey = serializePatchId(patchId)
    groundLayer = groundLayer || new GroundPatch(patchKey)
    groundLayer.isEmpty && (await groundLayer.bake())

    const ymin = this.extendedBounds.min.y
    const ymax = this.extendedBounds.max.y

    // const isBiomeTransition = groundLayer.isTransitionPatch()

    const blocks = groundLayer.iterBlocksQuery()
    for (const block of blocks) {
      const groundBuff = this.generateGroundBuffer(block, ymin, ymax)
      if (groundBuff) {
        const chunk_buffer = this.readBuffer(groundBuff.pos)
        chunk_buffer.set(groundBuff.content)
        this.writeBuffer(groundBuff.pos, chunk_buffer)
      }
    }

    cavesMask?.applyMaskOnTargetChunk(this)
  }
}

/**
 * Underground chunk (caverns)
 */

export class CavesMask extends ChunkMask {
  bake() {
    const groundLayer = new GroundPatch(asBox2(this.bounds))
    groundLayer.bake()
    // const bounds = asBox3(groundLayer.bounds)
    // bounds.max.y = groundLayer.valueRange.max
    // const chunkContainer = new ChunkContainer(bounds, 1)
    // chunkContainer.rawData.fill(0)
    const patchIter = groundLayer.iterBlocksQuery()
    for (const block of patchIter) {
      // const buffPos = asVect2(block.localPos)
      // const chunkBuff = chunkContainer.readBuffer(buffPos)
      const groundLevel = block.pos.y
      const ymin = this.extendedBounds.min.y
      const ymax = Math.min(groundLevel, this.extendedBounds.max.y)
      const startLocalPos = new Vector3(block.localPos.x, -1, block.localPos.z)
      let startIndex = this.getIndex(startLocalPos)
      for (let y = ymin; y <= ymax; y++) {
        block.pos.y = y
        const isEmptyBlock = DensityVolume.instance.getBlockDensity(
          block.pos,
          groundLevel + 20,
        )
        this.rawData[startIndex++] = isEmptyBlock ? 0 : 1
      }
      // chunkContainer.writeBuffer(buffPos, chunkBuff)
    }
  }
}
