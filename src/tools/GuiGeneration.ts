import { GUI } from 'dat.gui'

import * as Utils from '../common/utils'
import { HeightProfiler, SimplexNoiseSampler } from '../index'
import { EvalMode, ProcGenLayer } from '../procgen/ProcGenLayer'
import { MapType, WorldGenerator } from '../procgen/WorldGen'

/**
 * Populating procgen GUI settings
 * @param parentGui
 */
export const ProcGenGuiGenerator = (parentGui: GUI) => {
  console.log(`[ProcGenGuiGenerator] `)
  const worldGen = WorldGenerator.instance
  const { procLayers } = worldGen
  const selectOptions: any = procLayers.map((layer, i: number) => layer.name || `unknown#${i}`)
  selectOptions.push(MapType.Default)
  // worldGen.selectedLayer = MapType.Default
  const evalModes: EvalMode[] = [EvalMode.Default, EvalMode.Raw]
  const onLayerSwitch = (selection: string) => {
    // clear any existing subfolders
    Object.values(parentGui.__folders).forEach(folder =>
      parentGui.removeFolder(folder),
    )
    const selectedLayer =
      selection !== MapType.Default && procLayers.find(layer => layer.name === selection)
    // fill layer conf
    if (selectedLayer) {
      ProcLayerGui(parentGui, selectedLayer)
    }
  }
  parentGui
    .add(worldGen, 'selectedMap', selectOptions, selectOptions[0])
    .onChange((selection: string) => onLayerSwitch(selection))
  parentGui
    .add(worldGen, 'evalMode', evalModes)
    .onChange((evalMode: string) => worldGen.evalMode = (evalMode as EvalMode))
  onLayerSwitch(selectOptions?.[0] || '')
}

/**
 * Individual layer's GUI settings
 * @param parentGui
 * @param layer
 */
const ProcLayerGui = (parentGui: GUI, layer: ProcGenLayer) => {
  parentGui.open()
  if (layer instanceof ProcGenLayer) {
    // const shapeProfile = parentGui.addFolder(`Layer ${i}`);
    // const layerCopy = layer // need to make copy to avoid context loss
    NoiseParametrization(parentGui, layer.noiseSampler)
    ProfileSettings(parentGui, layer.samplerProfile);
  }
}

const NoiseParametrization = (parentGui: GUI, noiseSampler: SimplexNoiseSampler) => {
  const noiseSettings = parentGui.addFolder('noise')
  noiseSettings
    .add(noiseSampler, 'periodicity', 5, 10, 1)
    .onChange((val: number) => (noiseSampler.periodicity = val))
  noiseSettings
    .add(noiseSampler, 'harmonicsCount', 0, 10, 1)
    .name('count')
    .onChange(
      (count: number) => (noiseSampler.harmonicsCount = count),
    )
  noiseSettings
    .add(noiseSampler, 'harmonicGain', 0, 2, 0.1)
    .name('gain')
    .onChange((gain: number) => (noiseSampler.harmonicGain = gain))
  noiseSettings
    .add(noiseSampler, 'harmonicSpread', 0, 4, 0.1)
    .name('spread')
    .onChange(
      (spread: number) => (noiseSampler.harmonicSpread = spread),
    )
}

const ProfileSettings = (parentGui: GUI, profile: HeightProfiler) => {
  const profileSettings = parentGui.addFolder('profile')
  const { curveParams } = profile
  let prev = curveParams
  let curr = prev.next
  let next = curr?.next
  let i = 1
  while (curr && next) {
    // need to make copies to avoid context loss
    const prevPoint = prev.data
    const currPoint = curr.data
    const nextPoint = next.data
    profileSettings
      .add(curr.data, 'absc', 0, 1, 0.01)
      .name(`x${i++}`)
      .onChange(
        (val: number) =>
          (currPoint.absc = Utils.clamp(val, prevPoint.absc, nextPoint.absc)),
      )
    prev = curr
    curr = curr.next
    next = curr?.next
  }

  curr = curveParams.next
  i = 1
  while (curr?.next) {
    // need to make copy to avoid context loss
    const currPoint = curr.data
    profileSettings
      .add(curr.data, 'ord', 0, 1, 0.01)
      .name(`y${i++}`)
      .onFinishChange((val: number) => (currPoint.ord = val))
    curr = curr.next
  }
}
