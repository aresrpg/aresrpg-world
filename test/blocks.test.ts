import { Vector2, Vector3 } from 'three'

import { BlocksDataFormat, BlocksTask, BlocksTaskInput, FloatArrayOut } from '../src/processing/BlocksProcessing.js'
import { Block, BlockData, PatchKey } from '../src/utils/common_types.js'
import { PatchBase } from '../src/datacontainers/PatchBase.js'
import { asVect3 } from '../src/utils/patch_chunk.js'

import { getWorldDemoEnv } from './configs/world_demo_setup.js'
import { setupTestEnv, testSyncProcessing, testTaskDelegate } from './utils/tests_common.js'
// import { setupTestEnv } from './utils/tests_common_utils.js'

class BlocksVectorArrayTest extends BlocksTask<BlocksTaskInput, Block<BlockData>[]> {
    testName: string
    constructor(testName = '') {
        super()
        this.testName = testName
    }

    override onCompleted(taskOutput: Block<BlockData>[]) {
        const test = this.testName
        const blocks_count = taskOutput.length
        const format = this.processingParams.dataFormat ?? BlocksDataFormat.VectorArrayXYZ
        return { test, format, blocks_count }
    }
}

class BlocksFloatArrayTest extends BlocksTask<BlocksTaskInput, FloatArrayOut> {
    testName: string
    constructor(testName = '') {
        super()
        this.testName = testName
        this.processingParams.dataFormat = BlocksDataFormat.FloatArrayXZ
    }

    override onCompleted(taskOutput: FloatArrayOut) {
        const test = this.testName
        const format = this.processingParams.dataFormat
        const elevation_count = taskOutput.elevation.length
        const type_count = taskOutput.type.length
        return { test, format, elevation_count, type_count }
    }
}

/**
 *
 * @param patchKey
 * @param samplingResAsPow 0: each voxel, 1: each 2 voxel, 2: each 4 voxels, ...
 */
const samplePatch = (patchKey: PatchKey, patchDim: Vector2, samplingResAsPow: number) => {
    const samples: Vector3[] = []
    const voxelStep = Math.pow(2, samplingResAsPow)
    const patch = new PatchBase().fromKey(patchKey, patchDim)
    const blockIter = patch.iterDataQuery()
    for (const block of blockIter) {
        const { x, y } = block.pos
        if (x % voxelStep === 0 && y % voxelStep === 0) samples.push(asVect3(block.pos))
    }
    return samples
}

const createBlocksVectorTests = (inputBatch: Vector3[]) => {
    const groundBlocks = new BlocksVectorArrayTest('ground blocks').groundPositions(inputBatch)
    const floorBlocks = new BlocksVectorArrayTest('floor blocks').floorPositions(inputBatch)
    const peakBlocks = new BlocksVectorArrayTest('peak blocks').peakPositions(inputBatch)
    // const ceil_blocks_task = BlocksProcessing.getCeilingPositions(inputBatch)
    // res = await lower_task.delegate(localSource)
    return [groundBlocks, floorBlocks, peakBlocks]
}

const createBlocksFloatTests = (inputBatch: Float32Array) => {
    const groundBlocks = new BlocksFloatArrayTest('ground blocks').groundPositions(inputBatch)
    const floorBlocks = new BlocksFloatArrayTest('floor blocks').floorPositions(inputBatch)
    const peakBlocks = new BlocksFloatArrayTest('peak blocks').peakPositions(inputBatch)
    // const ceil_blocks_task = BlocksProcessing.getCeilingPositions(inputBatch)
    // res = await lower_task.delegate(localSource)
    return [groundBlocks, floorBlocks, peakBlocks]
}

export const blocksProcessingTests = async () => {
    console.log('Start blocks processing tests')
    const worldTestConf = getWorldDemoEnv() // get_world_env_settings()
    const { worldProvider, workerpool } = await setupTestEnv(worldTestConf)
    const patchKey = `0:0`
    const samplingRes = 0 // e.g. 1 sample per voxel
    const vectorSamples = samplePatch(patchKey, worldTestConf.getPatchDimensions(), samplingRes)
    const blocksVectorArrayTests = createBlocksVectorTests(vectorSamples)
    testSyncProcessing(blocksVectorArrayTests, worldProvider.taskHandlers)
    await testTaskDelegate(blocksVectorArrayTests, workerpool)
    const floatSamples = new Float32Array(vectorSamples.map(v => [v.x, v.y]).flat())
    const blocksFloatArrayTests = createBlocksFloatTests(floatSamples)
    testSyncProcessing(blocksFloatArrayTests, worldProvider.taskHandlers)
    await testTaskDelegate(blocksFloatArrayTests, workerpool)
    console.log('Done blocks processing tests')
}
