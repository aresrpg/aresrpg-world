import { WorldLocals } from '../../src/config/WorldEnv.js'
import { WorkerPool } from '../../src/node/NodeWorkerPool.js'
import { GenericTask } from '../../src/processing/TaskProcessing.js'
import { createWorldModules, TaskHandlers } from '../../src/WorldModules.js'
// required to embed world_compute_node_worker within dist/ folder
import '../../src/node/world_compute_node_worker.js'

export const setupTestEnv = async (worldLocalEnv: WorldLocals) => {
    const worldProvider = await createWorldModules(worldLocalEnv.toStub())
    const workerpool = new WorkerPool('world-test-worker')
    await workerpool.initPoolEnv(4, worldLocalEnv)
    console.log(`test env ready!!`)
    return { worldProvider, workerpool }
}

// Test tasks runnning within main thread
export const testSyncProcessing = (tasks: GenericTask[], taskHandlers: TaskHandlers) => {
    const env = 'MAIN'
    console.log(`[TESTENV: MAINTHREAD]: tasks processing`)
    const testResults: any = []
    for (const task of tasks) {
        const fields = task.process(taskHandlers)
        const formattedRes = { env, ...fields }
        testResults.push(formattedRes)
    }
    console.table(testResults)
    return testResults
}

export const testAsyncProcessing = async (tasks: GenericTask[], taskHandlers: TaskHandlers) => {
    const env = 'MAIN'
    console.log(`[TESTENV: MAINTHREAD]: tasks processing`)
    const testResults: any = []
    for await (const task of tasks) {
        const fields = await task.asyncProcess(taskHandlers)
        const formattedRes = { env, ...fields }
        testResults.push(formattedRes)
    }
    console.table(testResults)
    return testResults
}

// Test tasks delegated to workerpool
export const testTaskDelegate = async (tasks: GenericTask[], workerpool: WorkerPool) => {
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
