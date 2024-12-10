import { WorldUtils } from '../index'

import { WorldComputeApi } from './world-compute'

export const WorldWorkerInit = (workerPool: any) => {
  const rawArgsConverter = (...rawArgs: any) => {
    const args = rawArgs.map((arg: any) =>
      arg instanceof Array
        ? arg.map(item => WorldUtils.parseThreeStub(item))
        : WorldUtils.parseThreeStub(arg),
    )
    return args
  }

  const toStubs = (res: any) =>
    res instanceof Array
      ? res.map(item => item.toStub())
      : res.toStub?.() || res
  const worldComputeApiWrap: Record<string, any> = {}

  for (const [apiKey, apiCall] of Object.entries(WorldComputeApi)) {
    worldComputeApiWrap[apiKey] = async (...rawArgs: any) => {
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
