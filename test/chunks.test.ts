/**
 * Tests utils
 */

import { Vector2 } from 'three'

import { WorkerPool } from '../src/node/NodeWorkerPool.js'
import { ChunksPolling } from '../src/processing/ChunksPolling.js'
import { getPatchId, parseChunkKey } from '../src/utils/patch_chunk.js'
import { WorldLocals } from '../src/config/WorldEnv.js'
import { hashContent } from '../src/node/utils/chunk_node_utils.js'
import { ChunksTask } from '../src/processing/ChunksProcessing.js'
import { ChunkId, ChunkKey, PatchKey } from '../src/utils/common_types.js'
import { ChunkDataStub, ChunkMetadata } from '../src/datacontainers/ChunkContainer.js'

import { getWorldDemoEnv } from './configs/world_demo_setup.js'
import { setupTestEnv, testAsyncProcessing, testTaskDelegate } from './utils/tests_common.js'
// import '../src/node/world_compute_node_worker.js'

const extract_blob_info = async (compressedBlob: Blob) => {
    const streamDecomp = compressedBlob.stream().pipeThrough(new DecompressionStream('gzip'))
    const blobContent = await new Response(streamDecomp).arrayBuffer()
    const hash = await hashContent(blobContent, 6)
    const { size } = compressedBlob
    return { hash, size }
}

class ChunksTaskTest extends ChunksTask {
    testName: string
    constructor(testName = '') {
        super()
        this.testName = testName
        this.processingParams.skipBlobCompression = true
    }

    override async onCompleted(taskOutput: ChunkDataStub<ChunkMetadata>[]) {
        const testResults: any = []
        let chunks_keys = ''
        for await (const chunkStub of taskOutput) {
            const isEmpty = !chunkStub.rawdata
            const key = chunkStub.metadata.chunkKey as ChunkKey
            const size = chunkStub.rawdata?.length ?? 0
            const hash = isEmpty ? '' : await hashContent(chunkStub.rawdata.buffer as ArrayBuffer, 6)
            const { y } = parseChunkKey(key) as ChunkId
            chunks_keys += `${y}, `
            testResults.push({ key, hash, size })
        }
        chunks_keys = chunks_keys.slice(0, -2)
        const testResult = { test: this.testName, chunks_keys }
        return testResult
    }
}

const create_chunks_tasks = (patchKey: PatchKey) => {
    const lowerTask = new ChunksTaskTest('lower chunks').lowerChunks(patchKey)
    const upperTask = new ChunksTaskTest('upper chunks').upperChunks(patchKey)
    const fullTask = new ChunksTaskTest('full chunks').fullChunks(patchKey)
    const upperFullTask = new ChunksTaskTest('upper + chunks ').upperChunks(patchKey)
    upperFullTask.processingParams.fakeEmpty = true
    const lowerFullTask = new ChunksTaskTest('lower + chunks').lowerChunks(patchKey)
    lowerFullTask.processingParams.fakeEmpty = true
    return [lowerTask, upperTask, fullTask, upperFullTask, lowerFullTask]
}

/**
 * chunks polling
 */
const testChunksPolling = async (localSource: WorkerPool, world_local_env: WorldLocals) => {
    console.log(`[TESTENV: WORKERPOOL]: chunks polling`)
    const patchViewRanges = {
        near: 2,
        far: 4,
    }
    const chunksPolling = new ChunksPolling(patchViewRanges, world_local_env.getChunksVerticalRange())
    // skip compression for local gen
    // chunksPolling.skipBlobCompression = true

    const current_pos = new Vector2(0, 0)
    const patch_pos = getPatchId(current_pos, world_local_env.getPatchDimensions())
    const patch_view_dist = 2
    const chunks_tasks = chunksPolling.pollChunks(patch_pos, patch_view_dist)
    if (chunks_tasks) {
        console.log(`scheduled tasks count: ${chunks_tasks.length}`)
        // console.log(chunksPolling.getVisibleChunkIds())
        const pending_test_results = chunks_tasks.map(async chunks_task => {
            const task_res = await chunks_task.delegate(localSource)
            const blob_info = await extract_blob_info(task_res)
            return blob_info
        })
        const test_results = await Promise.all(pending_test_results)
        console.table(test_results)
    }
}

export const chunksProcessingTests = async () => {
    console.log('Start chunks processing tests')
    const worldTestConf = getWorldDemoEnv() // get_world_env_settings()
    const { worldProvider, workerpool } = await setupTestEnv(worldTestConf)
    const patch_key = `-1:-1`
    const chunks_tasks = create_chunks_tasks(patch_key)
    await testAsyncProcessing(chunks_tasks, worldProvider.taskHandlers)
    await testTaskDelegate(chunks_tasks, workerpool)
    await testChunksPolling(workerpool, worldTestConf)
    console.log('Done chunks processing tests')
}
