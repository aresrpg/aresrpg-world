import { ChunksProcessing } from '../src/processing/ChunksProcessing.js'
import {
  ItemsTask,
  ItemsTaskOutput,
} from '../src/processing/ItemsProcessing.js'
import { GenericTaskHandler } from '../src/processing/TaskProcessing.js'
import { PatchKey } from '../src/utils/common_types.js'

import { getWorldDemoEnv } from './configs/world_demo_setup.js'
import {
  setupTestEnv,
  testTaskProcessing,
  testTaskDelegate,
} from './utils/tests_common.js'

class ItemsTaskTest extends ItemsTask {
  testName: string
  constructor(testName = '') {
    super()
    this.testName = testName
  }

  override onCompleted(taskOutput: ItemsTaskOutput) {
    // const testResults: any = []
    // let chunks_keys = ''
    // for await (const chunkStub of taskOutput) {
    //     const key = chunkStub.metadata.chunkKey as ChunkKey
    //     const size = chunkStub.rawdata.length
    //     const hash = await hashContent(chunkStub.rawdata.buffer as ArrayBuffer, 6)
    //     const { y } = parseChunkKey(key) as ChunkId
    //     chunks_keys += `${y}, `
    //     testResults.push({ key, hash, size })
    // }
    // chunks_keys = chunks_keys.slice(0, -2)
    // const testResult = { test: this.testName, chunks_keys }
    console.log(taskOutput)
    return taskOutput
  }
}

const createItemsTests = (patchKey: PatchKey) => {
  const individualItems = new ItemsTaskTest(
    'individual items',
  ).bakeIndividualChunks(patchKey)
  const mergedItems = new ItemsTaskTest('merged items').mergeIndividualChunks(
    patchKey,
  )
  const pointPeakBlock = new ItemsTaskTest('items peak block').pointPeakBlock(
    patchKey,
  )
  return [individualItems, mergedItems, pointPeakBlock]
}

export const itemsProcessingTests = async () => {
  console.log('Start items processing tests')
  const worldTestConf = getWorldDemoEnv() // get_world_env_settings()
  const { worldModules, workerpool } = await setupTestEnv(worldTestConf)
  const patch_key = `1:-3`
  const chunks_tasks = createItemsTests(patch_key)
  const chunksTaskHandler = worldModules.taskHandlers[
    ChunksProcessing.handlerId
  ] as GenericTaskHandler
  await testTaskProcessing(chunks_tasks, chunksTaskHandler)
  await testTaskDelegate(chunks_tasks, workerpool)
  console.log('Done items processing tests')
}
