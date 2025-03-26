import { Vector2, Vector3 } from 'three'
import { BlocksTaskOutput } from '../src/processing/BlocksProcessing.js'
import { PatchKey } from '../src/utils/common_types.js'
import { PatchBase } from '../src/datacontainers/PatchBase.js'
import { asVect3, BlocksTask } from '../src/index.js'
import { getWorldDemoEnv } from './configs/world_demo_setup.js'
import { setupTestEnv, testTaskDelegate, testTaskProcessing } from './utils/tests_common.js'
import { GenericTaskHandler } from '../src/processing/TaskProcessing.js'
// import { setupTestEnv } from './utils/tests_common_utils.js'

class BlocksTaskTest extends BlocksTask {
  testName: string
  constructor(testName = '') {
    super()
    this.testName = testName
  }
  override onCompleted(taskOutput: BlocksTaskOutput) {
    const blocks_count = taskOutput.length
    const test = this.testName
    return { test, blocks_count }
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
    if (x % voxelStep === 0 && y % voxelStep === 0)
      samples.push(asVect3(block.pos))
  }
  return samples
}

const createBlocksTests = (inputBatch: Vector3[]) => {
  const groundBlocks = new BlocksTaskTest('ground blocks').groundPositions(inputBatch)
  const floorBlocks = new BlocksTaskTest('floor blocks').floorPositions(inputBatch)
  const peakBlocks = new BlocksTaskTest('peak blocks').peakPositions(inputBatch)
  // const ceil_blocks_task = BlocksProcessing.getCeilingPositions(inputBatch)
  // res = await lower_task.delegate(localSource)
  return [groundBlocks, floorBlocks, peakBlocks]
}

export const blocksProcessingTests = async () => {
  console.log("Start blocks processing tests")
  const worldTestConf = getWorldDemoEnv() // get_world_env_settings()
  const { worldModules, workerpool } = await setupTestEnv(worldTestConf)
  const patchKey = `0:0`
  const samplingRes = 0 // e.g. 1 sample per voxel
  const sampledPos = samplePatch(patchKey, worldTestConf.getPatchDimensions(), samplingRes)
  const blocksTests = createBlocksTests(sampledPos)
  const blocksTaskHandler = worldModules.taskHandlers[BlocksTask.handlerId] as GenericTaskHandler
  await testTaskProcessing(blocksTests, blocksTaskHandler)
  await testTaskDelegate(blocksTests, workerpool)
  console.log("Done blocks processing tests")
}


