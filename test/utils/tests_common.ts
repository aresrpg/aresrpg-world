import { WorldLocals } from '../../src/config/WorldEnv.js'
import { WorkerPool } from '../../src/node/NodeWorkerPool.js'
import {
  GenericTask,
  GenericTaskHandler,
} from '../../src/processing/TaskProcessing.js'
import { createWorldModules } from '../../src/WorldModules.js'
// required to embed world_compute_node_worker within dist/ folder
import '../../src/node/world_compute_node_worker.js'

export const setupTestEnv = async (worldLocalEnv: WorldLocals) => {
  const worldModules = createWorldModules(worldLocalEnv.toStub())
  const workerpool = new WorkerPool('world-test-worker')
  await workerpool.initPoolEnv(4, worldLocalEnv)
  console.log(`test env ready!!`)
  return { worldModules, workerpool }
}

// Test tasks runnning within main thread
export const testTaskProcessing = async (
  tasks: GenericTask[],
  taskHandler: GenericTaskHandler,
) => {
  const env = 'MAIN'
  console.log(`[TESTENV: MAINTHREAD]: tasks processing`)
  const testResults: any = []
  for await (const task of tasks) {
    const fields = await task.asyncProcess(taskHandler as any)
    const formattedRes = { env, ...fields }
    testResults.push(formattedRes)
  }
  console.table(testResults)
  return testResults
}

// Test tasks delegated to workerpool
export const testTaskDelegate = async (
  tasks: GenericTask[],
  workerpool: WorkerPool,
) => {
  const env = 'WORKERPOOL'
  console.log(`[TESTENV: WORKERPOOL]: tasks delegate`)
  const testResults: any = []
  for await (const task of tasks) {
    const fields = await task.delegate(workerpool)
    const formattedRes = { env, ...fields }
    testResults.push(formattedRes)
  }
  // const testResult = {
  //     task,
  //     result
  // }
  console.table(testResults)
  return testResults
}
