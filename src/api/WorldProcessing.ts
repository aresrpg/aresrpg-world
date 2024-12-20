import { BlocksBatch } from '../datacontainers/BlocksBatch'
import { WorldUtils } from '../index'
import { ProcessType, WorldProcess } from '../utils/types'

type WorldProcessImpl = new (args: any) => WorldProcess // typeof WorldProcess

export const ProcessMapping: Record<ProcessType, WorldProcessImpl> = {
  [ProcessType.BlocksBatch]: BlocksBatch,
}

export class WorldProcessing {
  static parseArgs(rawArgs: any) {
    const args = rawArgs.map((arg: any) =>
      arg instanceof Array
        ? arg.map(item => WorldUtils.convert.parseThreeStub(item))
        : WorldUtils.convert.parseThreeStub(arg),
    )
    return args
  }

  static async process(processType: ProcessType, processArgs: any) {
    processArgs = WorldProcessing.parseArgs(processArgs)
    const ProcessClass = ProcessMapping[processType]
    const processInstance = new ProcessClass(processArgs)
    await processInstance.process()
    return processInstance.toStub()
  }
}
