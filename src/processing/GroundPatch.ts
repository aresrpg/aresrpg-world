import { Box2, Vector2 } from 'three'

import { GroundBlock, BiomeLands, PatchBoundId, PatchId, BiomeType, GroundBlockData, LandFields, PartialLandFields } from '../utils/common_types.js'
import { serializePatchId } from '../utils/patch_chunk.js'
import { Biome, BiomeInfluence } from '../procgen/Biome.js'
import { PatchDataContainer, PatchDataStub } from '../datacontainers/PatchContainer.js'
import { getPatchNeighbours, getPatchBoundingPoints } from '../utils/spatial_utils.js'
import { bilinearInterpolation } from '../utils/math_utils.js'
import { WorldModules } from '../factory/WorldModules.js'
import { Ground } from '../procgen/Ground.js'
import { GroundDataAdapter } from '../datacontainers/BlockDataAdapter.js'
import { LinkedList } from '../datacontainers/LinkedList.js'

export type PatchBoundingBiomes = Record<PatchBoundId, BiomeInfluence>

export type GroundPatchStub = PatchDataStub & {
    valueRange?: { min: number; max: number }
}

export type BlockIteratorRes = IteratorResult<GroundBlock, void>

export const parseGroundFlags = (rawFlags: number) => {
    const groundFlags = {
        boardMode: (rawFlags & 1) !== 0,
        cavern: ((rawFlags >> 1) & 1) !== 0,
    }
    return groundFlags
}

export class GroundPatch extends PatchDataContainer<GroundBlockData> {
    biomeInfluence: BiomeInfluence | PatchBoundingBiomes | undefined
    rawData: Uint32Array
    dataAdapter: GroundDataAdapter
    valueRange = { min: 512, max: 0 } // here elevation
    isEmpty = true

    constructor(bounds = new Box2(), margin = 1) {
        super(bounds, margin)
        this.rawData = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
        this.dataAdapter = new GroundDataAdapter()
    }

    override init(bounds: Box2): void {
        super.init(bounds)
        this.rawData = new Uint32Array(this.extendedDims.x * this.extendedDims.y)
    }

    prepare(biome: Biome) {
        const getBiomeInfluence = () => {
            const { xMyM, xMyP, xPyM, xPyP } = PatchBoundId
            // eval biome at patch corners
            const equals = (v1: BiomeInfluence, v2: BiomeInfluence) => {
                const different = Object.keys(v1)
                    // .map(k => parseInt(k) as BiomeType)
                    .find(k => v1[k as BiomeType] !== v2[k as BiomeType])
                return !different
            }
            const boundsPoints = getPatchBoundingPoints(this.bounds)
            const boundsInfluences = {} as PatchBoundingBiomes
                ;[xMyM, xMyP, xPyM, xPyP].map(key => {
                    const boundPos = boundsPoints[key] as Vector2
                    const biomeInfluence = biome.getBiomeInfluence(boundPos)
                    boundsInfluences[key] = biomeInfluence
                    // const block = computeGroundBlock(asVect3(pos), biomeInfluence)
                    return biomeInfluence
                })
            const allEquals =
                equals(boundsInfluences[xMyM], boundsInfluences[xPyM]) &&
                equals(boundsInfluences[xMyM], boundsInfluences[xMyP]) &&
                equals(boundsInfluences[xMyM], boundsInfluences[xPyP])
            return allEquals ? boundsInfluences[xMyM] : boundsInfluences
        }

        this.biomeInfluence = getBiomeInfluence()
    }

    isTransitionPatch() {
        return !!(this.biomeInfluence as PatchBoundingBiomes)[PatchBoundId.xMyM]
    }

    getBlockBiome(blockPos: Vector2) {
        if (this.isTransitionPatch()) {
            return bilinearInterpolation(blockPos, this.bounds, this.biomeInfluence as PatchBoundingBiomes) as BiomeInfluence
        }
        return this.biomeInfluence as BiomeInfluence
    }

    computeGroundBlock = (blockPos: Vector2, { ground, biomes }: { ground: Ground; biomes: Biome }) => {
        const biomeInfluence = this.getBlockBiome(blockPos)
        // const biomeInfluenceBis = Biome.instance.getBiomeInfluence(blockPos)
        const biomeType = biomes.getBiomeType(biomeInfluence)
        const rawVal = ground.getRawVal(blockPos)
        const biomeLand = ground.getBiomeLand(biomeType, rawVal) as BiomeLands
        // const confIndex = Biome.instance.getConfIndex(currLevelConf.key)
        // const confData = Biome.instance.indexedConf.get(confIndex)
        const level = ground.getGroundLevel(blockPos, rawVal, biomeInfluence)
        const isCavern = false // DensityVolume.instance.getBlockType(blockPos) === BlockType.NONE
        let selectedLand = biomeLand as LinkedList<PartialLandFields> // isCavern ? nominalConf : nominalConf
        // let isEmpty = isCavern
        // while (isEmpty && level > 0) {
        //   blockPos.y = level--
        //   isEmpty = DensityVolume.instance.getBlockType(blockPos) === BlockType.NONE
        // }
        // const pos = new Vector3(blockPos.x, level, blockPos.z)
        if (!isCavern && biomeLand.next?.data) {
            const variation = ground.transition.eval(blockPos.clone().multiplyScalar(50)) // Math.cos(0.1 * blockPos.length()) / 100
            const min = new Vector2(biomeLand.data.threshold, biomeLand.data.elevation)
            const max = new Vector2(biomeLand.next.data.threshold, biomeLand.next.data.elevation)
            const rangeBox = new Box2(min, max)
            const dims = rangeBox.getSize(new Vector2())
            // const slope = dims.y / dims.x
            const distRatio = (rawVal - min.x) / dims.x
            const threshold = 4 * distRatio
            selectedLand = variation > threshold && biomeLand.prev?.data.type ? biomeLand.prev : biomeLand
        }

        const landData = selectedLand.data as LandFields

        if (isNaN(landData.type)) {
            console.log(biomeLand.data)
        }

        // }
        // level += offset
        const flags = isCavern ? 0b010 : 0
        const groundBlockData: GroundBlockData = {
            level,
            biome: biomeType,
            landIndex: selectedLand.index,
            landId: landData.key,
            flags,
        }
        return groundBlockData
    }

    /**
     * whole patch by default
     * if genBounds specified, only sub rows/cols will be generated
     */
    bake(worldModules: WorldModules, regionBounds?: Box2) {
        const { worldLocalEnv } = worldModules
        /**
         * required for transition patches to insure interpolated patch corners
         * used to compute blocks are the same as near patch
         */
        const fillMarginsFromNearPatches = () => {
            const patchDim = worldLocalEnv.getPatchDimensions()
            // copy four edges margins
            const sidePatches = getPatchNeighbours(this.patchId as PatchId).map(patchId =>
                new GroundPatch().fromKey(serializePatchId(patchId), patchDim, 0),
            )
            sidePatches.forEach(sidePatch => {
                const marginOverlap = this.extendedBounds.intersect(sidePatch.bounds)
                // for each side patches only gen overlapping margins with current patch
                sidePatch.bake(worldModules, marginOverlap)
                // copy side patch to current patch on overlapping margin zone
                // const count = this.rawData.reduce((count, val) => count + (val ? 1 : 0), 0)
                // const count2 = sidePatch.rawData.reduce((count, val) => count + (val ? 1 : 0), 0)
                // console.log(`rawData count:  source ${count2} target ${count}`)
                sidePatch.copyContentToTarget(this, false)
            })
        }

        this.prepare(worldModules.biomes)
        const { valueRange } = this
        // omit margin blocks to bake them separately
        const doMarginsApart = !regionBounds && this.margin > 0 && this.patchKey.length > 0
        const blocks = this.iterData(regionBounds, !doMarginsApart)
        for (const block of blocks) {
            // EXPERIMENTAL: is it faster to perform bilinear interpolation rather
            // than sampling biome for each block?
            // if biome is the same at each patch corners, no need to interpolate
            const blockData = this.computeGroundBlock(block.pos, worldModules)
            // blockData.landIndex = this.isTransitionPatch() ? 0 : blockData.landIndex
            valueRange.min = Math.min(valueRange.min, blockData.level)
            valueRange.max = Math.max(valueRange.max, blockData.level)
            this.writeData(block.localPos, blockData)
        }
        this.isEmpty = false
        // for whole patch with margins only
        doMarginsApart && fillMarginsFromNearPatches()
        // return groundPatch
    }

    // duplicate() {
    //   const copy = this.key ? GroundPatch.fromKey(this.key) : new GroundPatch(this.bounds, this.margin)
    //   copy.rawData.set(this.rawData)
    //   return copy
    // }

    override toStub() {
        const patchStub = super.toStub()
        const { valueRange } = this
        const groundPatchStub: GroundPatchStub = {
            ...patchStub,
            // rawdata: rawData,
            valueRange,
        }
        return groundPatchStub
    }

    override fromStub(patchStub: GroundPatchStub) {
        super.fromStub(patchStub)
        const { rawdata } = patchStub
        if (rawdata) {
            this.rawData = new Uint32Array(this.dataSize)
            this.rawData.set(rawdata)
        } else {
            console.warn(
                'could not initialize PatchDataContainer properly: raw data missing. If this is an empty chunk, use ChunkContainer instead',
            )
        }
        this.valueRange.min = patchStub.valueRange?.min || this.valueRange.min
        this.valueRange.max = patchStub.valueRange?.max || this.valueRange.max
        return this
    }

    // getBlocksRow(zRowIndex: number) {
    //   const rowStart = zRowIndex * this.dimensions.y
    //   const rowEnd = rowStart + this.dimensions.x
    //   const rowRawData = this.rawData.slice(rowStart, rowEnd)
    //   return rowRawData
    // }

    // getBlocksCol(xColIndex: number) {

    // }

    /**
     * Split container into fixed size patches
     */
    // splitAsPatchMap() {

    // }
}
