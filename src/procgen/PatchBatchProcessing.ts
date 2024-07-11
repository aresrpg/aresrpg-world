import { PatchBaseCache, PatchState } from './PatchBaseCache'
import { PatchBlocksCache } from './PatchBlocksCache'

enum PatchCategory {
  Regular = 'regular',
  Transition = 'transition',
  Skipped = 'skipped',
}
export class PatchBatchProcessing {
  startTime = Date.now()
  elapsedTime = 0
  count = 0
  inputPatches: Record<PatchCategory, PatchBaseCache[]> = {
    [PatchCategory.Regular]: [],
    [PatchCategory.Transition]: [],
    [PatchCategory.Skipped]: [],
  }

  outputPatches: PatchBlocksCache[] = []

  constructor(
    createdPatches: PatchBaseCache[],
    // updatedPatches: PatchBaseCache[],
  ) {
    const { inputPatches } = this
    // this.outputPatches.push(...updatedPatches)
    // sort patches in categories
    for (const patch of createdPatches) {
      const nearPatches = patch.getNearPatches()
      const isEdgePatch = nearPatches.length !== 8
      if (!isEdgePatch) {
        patch.isTransitionPatch =
          patch.isBiomeTransition ||
          !!nearPatches.find(edgePatch => edgePatch.isBiomeTransition)
        patch.isTransitionPatch
          ? inputPatches.transition.push(patch)
          : inputPatches.regular.push(patch)
      } else {
        inputPatches.skipped.push(patch)
      }
    }
    console.log(
      `[BatchProcessing] START processing ${createdPatches.length} patches`,
    )
  }

  async *iterRegularPatches(asyncMode = false) {
    let count = 0
    let elapsedTime = Date.now()
    const { inputPatches } = this
    for (const patch of inputPatches.regular) {
      asyncMode && (await new Promise(resolve => setTimeout(resolve, 0)))
      const patchBlocks = patch.genGroundBlocks()
      patchBlocks.initialPatchRef = patch
      // patch.genEntitiesBlocks(patchBlocks, patch.spawnedEntities)
      count++
      this.outputPatches.push(patchBlocks)
      yield patchBlocks
    }

    elapsedTime = Date.now() - elapsedTime
    const avgTime = Math.round(elapsedTime / count)
    console.log(
      `processed ${count} regular patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
    )
    this.elapsedTime += elapsedTime
    this.count += count
  }

  async *iterTransitionPatches(asyncMode = false) {
    let elapsedTime = Date.now()
    const { inputPatches } = this
    // prepare next pass
    inputPatches.transition.forEach(patch => {
      patch.isCloseToRefPatch = !!patch
        .getNearPatches()
        .find(p => !p.isTransitionPatch && p.state >= PatchState.Filled)
    })
    let count = 0
    for (const patch of inputPatches.transition) {
      asyncMode && (await new Promise(resolve => setTimeout(resolve, 0)))
      const patchBlocks = patch.genGroundBlocks()
      patchBlocks.initialPatchRef = patch
      // patch.genEntitiesBlocks(patchBlocks, patch.spawnedEntities)
      count++
      this.outputPatches.push(patchBlocks)
      yield patchBlocks
    }

    elapsedTime = Date.now() - elapsedTime
    const avgTime = Math.round(elapsedTime / count)
    console.log(
      `processed ${count} transition patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
    )
    this.elapsedTime += elapsedTime
    this.count += count
  }

  finaliseBatch() {
    let elapsedTime = Date.now()
    // finalize patches skipping already
    this.outputPatches.map(
      patch => patch.initialPatchRef?.genEntitiesBlocks(patch),
    )
    elapsedTime = Date.now() - elapsedTime
    // console.log(`finalising batch took ${elapsedTime}ms for ${count} items`)
    this.elapsedTime += elapsedTime
    const avgTime = Math.round(this.elapsedTime / this.count)
    console.log(
      `[BatchProcessing] DONE processed ${this.count} patches in ${this.elapsedTime} ms (avg ${avgTime} ms per patch) `,
    )
  }
}
