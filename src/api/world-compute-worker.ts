import { WorldComputeApi, WorldUtils } from ".."

export const WorldWorkerInit = (workerPool: any) => {
    const rawArgsConverter = (...rawArgs) => {
        const args = rawArgs.map(arg =>
            arg instanceof Array
                ? arg.map(item => WorldUtils.parseThreeStub(item))
                : WorldUtils.parseThreeStub(arg),
        )
        return args
    }

    const toStubs = (res: any) => res instanceof Array ? res.map(item => item.toStub()) : res.toStub?.() || res
    const worldComputeApiWrap = {}

    for (const [apiKey, apiCall] of Object.entries(WorldComputeApi)) {
        worldComputeApiWrap[apiKey] = async (...rawArgs) => {
            const args = rawArgsConverter(...rawArgs)
            const res = await apiCall(...args)
            const stubs = toStubs(res)
            return stubs
        }
    }

    console.log(`world compute worker init`)

    workerPool.worker({
        ...worldComputeApiWrap,
    })
}