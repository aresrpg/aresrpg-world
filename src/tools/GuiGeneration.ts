import { GUI } from 'dat.gui';
import { GenLayer, ProcGenLayer, WorldGenerator } from "@aresrpg/aresrpg-world";
import * as Utils from '../../utils/math'

/**
 * Populating procgen GUI settings
 * @param parentGui 
 */
export const ProcGenGuiGenerator = (parentGui: GUI) => {
    console.log(`[ProcGenGuiGenerator] `)
    const worldGen = WorldGenerator.instance
    const { procLayers } = worldGen
    const layers = GenLayer.toArray(procLayers)
    const selectOptions = layers.map((_, i) => `layer#${i}`)
    selectOptions.push("all")
    worldGen.config = { selection: selectOptions[0] }
    const onLayerSwitch = (selection) => {
        // clear any existing subfolders
        Object.values(parentGui.__folders).forEach(folder => parentGui.removeFolder(folder))
        const selectedLayer = selection !== 'all' && ProcGenLayer.getLayer(procLayers, selection)
        // switch to layer
        worldGen.layerSelection = selection
        worldGen.config = { selection }
        // fill layer conf
        if (selectedLayer) {
            ProcLayerGui(parentGui, selectedLayer)
        }
    }
    parentGui.add(worldGen.config, 'selection', selectOptions, selectOptions[0])
        .onChange((selection) => onLayerSwitch(selection));
    onLayerSwitch(selectOptions[0])
}


/**
 * Individual layer's GUI settings
 * @param parentGui 
 * @param layer 
 */
const ProcLayerGui = (parentGui: GUI, layer: GenLayer) => {
    parentGui.open()
    const harmonics = parentGui.addFolder('harmonics'),
        abscisses = parentGui.addFolder('spline abscisses'),
        ordinates = parentGui.addFolder('spline ordinates');

    if (layer instanceof ProcGenLayer) {
        // const shapeProfile = parentGui.addFolder(`Layer ${i}`);
        const layerCopy = layer // need to make copy to avoid context loss
        harmonics.add(layer.noiseSampler, 'periodicity', 5, 10, 1)
            .onChange(val => layerCopy.noiseSampler.periodicity = val);
        harmonics.add(layer.noiseSampler, 'harmonicsCount', 0, 10, 1)
            .name('count')
            .onChange(count => layerCopy.noiseSampler.harmonicsCount = count);
        harmonics.add(layer.noiseSampler, 'harmonicGain', 0, 2, 0.1)
            .name('gain')
            .onChange(gain => layerCopy.noiseSampler.harmonicGain = gain);
        harmonics.add(layer.noiseSampler, 'harmonicSpread', 0, 4, 0.1)
            .name('spread')
            .onChange(spread => layerCopy.noiseSampler.harmonicSpread = spread);
        const { curveParams } = layerCopy.samplerProfile
        let prev = curveParams, curr = prev.next, next = curr?.next
        let i = 1
        while (next) {
            // need to make copies to avoid context loss
            const prevPoint = prev.data
            const currPoint = curr.data
            const nextPoint = next.data
            abscisses.add(curr.data, 'absc', 0, 1, 0.01)
                .name(`x${i++}`)
                .onChange((val) => currPoint.absc = Utils.clamp(val, prevPoint.absc, nextPoint.absc));
            prev = curr
            curr = curr.next
            next = curr?.next
        }

        curr = curveParams.next, i = 1
        while (curr.next) {
            // need to make copy to avoid context loss
            const currPoint = curr.data
            ordinates.add(curr.data, 'ord', 0, 1, 0.01)
                .name(`y${i++}`)
                .onFinishChange((val) => currPoint.ord = val);
            curr = curr.next
        }
    }
}