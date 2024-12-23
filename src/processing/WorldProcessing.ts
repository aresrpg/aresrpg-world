import { BlocksBatch } from './BlocksBatch'
import { WorldUtils } from '../index'
import { ItemsChunkLayer } from './ItemsInventory'
import { ProcessType, WorldProcess } from '../utils/types'

type WorldProcessImpl = new (args: any) => WorldProcess // typeof WorldProcess

export const ProcessMapping: Record<ProcessType, WorldProcessImpl> = {
  [ProcessType.BlocksBatch]: BlocksBatch,
  [ProcessType.ItemsLayer]: ItemsChunkLayer,
}

export class WorldProcessing {
  static parseArgs(rawArgs: any) {
    // const args = rawArgs.map((arg: any) =>
    const args = rawArgs instanceof Array
      ? rawArgs.map(arg => WorldUtils.convert.parseThreeStub(arg))
      : WorldUtils.convert.parseThreeStub(rawArgs)
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
