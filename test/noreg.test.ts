/**
 * Tests running on workers local environment (browser or node)
 */

import { Worker } from 'worker_threads'

import { Vector2 } from 'three'

import { WorkerPool } from '../src/node/NodeWorkerPool.js'
import { ChunksPolling } from '../src/processing/ChunksPolling.js'
import { getPatchId } from '../src/utils/patch_chunk.js'
import { WorldLocals } from '../src/config/WorldEnv.js'
import { ChunkStub } from '../src/datacontainers/ChunkContainer.js'
import { hashContent } from '../src/node/utils/chunk_node_utils.js'
import {
  ChunksProcessing,
  ChunksProcessingOutput,
} from '../src/processing/ChunksProcessing.js'
import { PatchKey } from '../src/utils/common_types.js'
import { WorldModules } from '../src/WorldModules.js'

import { getWorldDemoEnv } from './configs/world_demo_setup.js'

/**
 * Tests utils
 */

const get_chunk_info = async (chunkStub: ChunkStub) => {
  const key = chunkStub.metadata.chunkKey
  const size = chunkStub.rawdata.length
  const hash = await hashContent(chunkStub.rawdata.buffer as ArrayBuffer, 6)
  const chunkInfo = { key, hash, size }
  return chunkInfo
}

const extract_blob_info = async (compressedBlob: Blob) => {
  const streamDecomp = compressedBlob
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  const blobContent = await new Response(streamDecomp).arrayBuffer()
  const hash = await hashContent(blobContent, 6)
  const { size } = compressedBlob
  return { hash, size }
}

const on_chunk_task_completed = async (taskRes: ChunksProcessingOutput) => {
  const report: any[] = []
  for await (const chunk of taskRes) {
    const info = await get_chunk_info(chunk)
    report.push(info)
  }
  // const info = await Promise.all(taskRes.map(chunk => get_chunk_info(chunk)))
  console.table(report)
  // return taskRes
}

export const create_chunks_tasks = (patchKey: PatchKey) => {
  const base_options = {
    skipBlobCompression: true,
    onCompleted: on_chunk_task_completed,
  }

  const lower_task = ChunksProcessing.lowerChunks(patchKey, {
    ...base_options,
    onStarted: () => console.log(`TEST: lower chunks`),
  })

  // res = await lower_task.delegate(localSource)
  // res.map(chunk => console.log(`${chunk.metadata.chunkKey}, size: ${chunk.rawdata.length}`))

  const upper_task = ChunksProcessing.upperChunks(patchKey, {
    ...base_options,
    onStarted: () => console.log(`TEST: upper chunks`),
  })

  const full_task = ChunksProcessing.fullChunks(patchKey, {
    ...base_options,
    onStarted: () => console.log(`TEST: full chunks`),
  })

  const lower_full_task = ChunksProcessing.lowerChunks(patchKey, {
    ...base_options,
    fakeEmpty: true,
    onStarted: () => console.log(`TEST: lower chunks with fake empty chunks`),
  })

  const upper_full_task = ChunksProcessing.upperChunks(patchKey, {
    ...base_options,
    fakeEmpty: true,
    onStarted: () => console.log(`TEST: upper chunks with fake empty chunks`),
  })

  return [lower_task, upper_task, full_task, lower_full_task, upper_full_task]
}

// Tasks delegated to workerpool
const testChunksDelegate = async (localSource: WorkerPool) => {
  console.log(`[TESTENV: WORKERPOOL]: chunks delegate`)
  const patch_key = `-1:-1`
  const chunks_tasks = create_chunks_tasks(patch_key)
  for await (const task of chunks_tasks) {
    await task.delegate(localSource)
  }
}

// Tasks runnning within main thread
const testChunksProcessing = async (worldInstance: WorldModules) => {
  console.log(`[TESTENV: MAINTHREAD]: chunks processing`)
  console.log(worldInstance.biome.mappings)
  const patch_key = `-1:-1`
  const chunks_tasks = create_chunks_tasks(patch_key)
  for await (const task of chunks_tasks) {
    await task.asyncProcess(worldInstance)
  }
}

/**
 * chunks polling
 */
const testChunksPolling = async (
  localSource: WorkerPool,
  world_local_env: WorldLocals,
) => {
  console.log(`[TESTENV: WORKERPOOL]: chunks polling`)
  const chunksPolling = new ChunksPolling(
    world_local_env.rawSettings.patchViewRanges,
    world_local_env.getChunksVerticalRange(),
  )
  // skip compression for local gen
  // chunksPolling.skipBlobCompression = true

  const current_pos = new Vector2(0, 0)
  const patch_pos = getPatchId(
    current_pos,
    world_local_env.getPatchDimensions(),
  )
  const patch_view_dist = 2
  const chunks_tasks = chunksPolling.pollChunks(patch_pos, patch_view_dist)
  if (chunks_tasks) {
    console.log(`scheduled tasks count: ${chunks_tasks.length}`)
    // console.log(chunksPolling.getVisibleChunkIds())
    const pending_tasks_info = chunks_tasks.map(async chunks_task => {
      const task_res = await chunks_task.delegate(localSource)
      const blob_info = await extract_blob_info(task_res)
      return blob_info
    })
    const report = await Promise.all(pending_tasks_info)
    console.table(report)
  }
}

const test_env_main_setup = (world_local_env: WorldLocals) => {
  const world_modules = new WorldModules(world_local_env.rawSettings)
  return world_modules
}

const test_env_workerpool_setup = async (world_local_env: WorldLocals) => {
  // create workerpool to run locally
  const workerpool = new WorkerPool()
  await workerpool.initPoolEnv(
    4,
    world_local_env,
    new Worker(
      new URL('../dist/src/node/world_compute_node_worker.js', import.meta.url),
    ),
  )
  console.log(`test env ready!!`)
  return workerpool
}

const run_tests = async () => {
  // Main thread
  const world_test_config = getWorldDemoEnv() // get_world_env_settings()
  const main_test_env = test_env_main_setup(world_test_config)
  await testChunksProcessing(main_test_env)
  // Workerpool
  test_env_workerpool_setup(world_test_config).then(async workerpool => {
    await testChunksDelegate(workerpool)
    testChunksPolling(workerpool, world_test_config)
  })
}

run_tests()
