import { WorldComputeApi, WorldUtils } from ".."

export const WorldWorkerInit = (workerPool: any) => {
    const raw_args_converter = (...raw_args) => {
        const args = raw_args.map(arg =>
            arg instanceof Array
                ? arg.map(item => WorldUtils.parseThreeStub(item))
                : WorldUtils.parseThreeStub(arg),
        )
        return args
    }
    const world_compute_api_wrap = {}

    for (const [api_key, api_method] of Object.entries(WorldComputeApi)) {
        world_compute_api_wrap[api_key] = raw_args =>
            api_method(...raw_args_converter(raw_args))
    }

    console.log(`world compute worker init`)

    workerPool.worker({
        ...world_compute_api_wrap,
    })
}