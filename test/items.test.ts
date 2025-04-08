import { ItemsTask, ItemsTaskInput, ItemsTaskOutput } from '../src/processing/ItemsProcessing.js'
import { PatchKey } from '../src/utils/common_types.js'

import { getWorldDemoEnv } from './configs/world_demo_setup.js'
import { setupTestEnv, testSyncProcessing, testTaskDelegate } from './utils/tests_common.js'

class ItemsTaskTest extends ItemsTask<ItemsTaskInput, ItemsTaskOutput> {
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
    const individualItems = new ItemsTaskTest('individual items').individualChunks(patchKey)
    const mergedItems = new ItemsTaskTest('merged items').mergedChunk(patchKey)
    const spawnedElements = new ItemsTaskTest('items peak block').spawnedElements(patchKey)
    return [individualItems, mergedItems, spawnedElements]
}

export const itemsProcessingTests = async () => {
    console.log('Start items processing tests')
    const worldTestConf = getWorldDemoEnv() // get_world_env_settings()
    const { worldProvider, workerpool } = await setupTestEnv(worldTestConf)
    const patch_key = `1:-3`
    const chunks_tasks = createItemsTests(patch_key)
    await testSyncProcessing(chunks_tasks, worldProvider.taskHandlers)
    await testTaskDelegate(chunks_tasks, workerpool)
    console.log('Done items processing tests')
}
