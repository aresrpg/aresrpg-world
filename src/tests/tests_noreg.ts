/**
 * Tests running on workers local environment (browser or node)
 */

import { Vector2 } from 'three'

import { WorkerPool } from '../node/NodeWorkerPool.js'
import { ChunksPolling } from '../processing/ChunksPolling.js'
import { getPatchId } from '../utils/patch_chunk.js'
import { WorldEnv } from '../config/WorldEnv.js'
import { ChunkStub } from '../datacontainers/ChunkContainer.js'
import { hashContent } from '../node/utils/chunk_node_utils.js'
import {
  ChunksProcessing,
  ChunksProcessingOutput,
} from '../processing/ChunksProcessing.js'
import { PatchKey } from '../utils/common_types.js'
import { WorldModules } from '../WorldModules.js'

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
  const report = []
  for await (const chunk of taskRes) {
    const info = await get_chunk_info(chunk)
    report.push(info)
  }
  // const info = await Promise.all(taskRes.map(chunk => get_chunk_info(chunk)))
  console.table(report)
  // return taskRes
}

export const create_chunks_tasks = (patchKey: PatchKey) => {
  const test_tasks = []
  let task
  task = ChunksProcessing.lowerChunks(patchKey)
  task.processingParams.skipBlobCompression = true
  task.onStarted = () => console.log(`TEST: lower chunks`)
  task.onCompleted = on_chunk_task_completed
  test_tasks.push(task)
  // res = await task.delegate(localSource)
  // res.map(chunk => console.log(`${chunk.metadata.chunkKey}, size: ${chunk.rawdata.length}`))

  task = ChunksProcessing.upperChunks(patchKey)
  task.processingParams.skipBlobCompression = true
  task.onStarted = () => console.log(`TEST: upper chunks`)
  task.onCompleted = on_chunk_task_completed
  test_tasks.push(task)

  task = ChunksProcessing.fullChunks(patchKey)
  task.processingParams.skipBlobCompression = true
  task.onStarted = () => console.log(`TEST: full chunks`)
  task.onCompleted = on_chunk_task_completed
  test_tasks.push(task)

  task = ChunksProcessing.lowerChunks(patchKey)
  task.processingParams.skipBlobCompression = true
  task.processingParams.fakeEmpty = true
  task.onStarted = () =>
    console.log(`TEST: lower chunks with fake empty chunks`)
  task.onCompleted = on_chunk_task_completed
  test_tasks.push(task)

  task = ChunksProcessing.upperChunks(patchKey)
  task.processingParams.skipBlobCompression = true
  task.processingParams.fakeEmpty = true
  task.onStarted = () =>
    console.log(`TEST: upper chunks with fake empty chunks`)
  task.onCompleted = on_chunk_task_completed
  test_tasks.push(task)

  return test_tasks
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
  world_env: WorldEnv,
) => {
  console.log(`[TESTENV: WORKERPOOL]: chunks polling`)
  const chunksPolling = new ChunksPolling(
    world_env.rawSettings.patchViewRanges,
    world_env.getChunksVerticalRange(),
  )
  // skip compression for local gen
  // chunksPolling.skipBlobCompression = true

  const current_pos = new Vector2(0, 0)
  const patch_pos = getPatchId(current_pos, world_env.getPatchDimensions())
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

const test_env_main_setup = (world_env: WorldEnv) => {
  const world_modules = new WorldModules(world_env.rawSettings)
  return world_modules
}

const test_env_workerpool_setup = async (world_env: WorldEnv) => {
  // create workerpool to run locally
  const workerpool = new WorkerPool()
  await workerpool.initPoolEnv(4, world_env)
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
