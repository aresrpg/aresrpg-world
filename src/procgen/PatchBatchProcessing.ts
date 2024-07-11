import { PatchBaseCache, PatchState } from './PatchBaseCache'

enum PatchCategory {
  Regular = 'regular',
  Transition = 'transition',
  Pending = 'pending',
  Skipped = 'skipped',
}
export class PatchBatchProcessing {
  startTime = Date.now()
  elapsedTime = 0
  count = 0
  patches: Record<PatchCategory, PatchBaseCache[]> = {
    [PatchCategory.Regular]: [],
    [PatchCategory.Transition]: [],
    [PatchCategory.Skipped]: [],
    [PatchCategory.Pending]: [],
  }

  constructor(
    createdPatches: PatchBaseCache[],
    updatedPatches: PatchBaseCache[],
  ) {
    this.patches.pending.push(...updatedPatches)
    // sort patches in categories
    for (const patch of createdPatches) {
      const nearPatches = patch.getNearPatches()
      const isEdgePatch = nearPatches.length !== 8
      if (!isEdgePatch) {
        patch.isTransitionPatch =
          patch.isBiomeTransition ||
          !!nearPatches.find(edgePatch => edgePatch.isBiomeTransition)
        patch.isTransitionPatch
          ? this.patches.transition.push(patch)
          : this.patches.regular.push(patch)
      } else {
        this.patches.skipped.push(patch)
      }
    }
    console.log(
      `[BatchProcessing] START filling ${createdPatches.length} pacthes, updating ${updatedPatches} patches)`,
    )
  }

  async *iterRegularPatches() {
    let count = 0
    let elapsedTime = Date.now()
    for (const patch of this.patches.regular) {
      await new Promise(resolve => setTimeout(resolve, 0))
      const patchBlocks = patch.genGroundBlocks()
      patch.genEntitiesBlocks(patchBlocks, patch.spawnedEntities)
      count++
      this.patches.pending.push(patch)
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

  async *iterTransitionPatches() {
    let elapsedTime = Date.now()
    // prepare next pass
    this.patches.transition.forEach(patch => {
      patch.isCloseToRefPatch = !!patch
        .getNearPatches()
        .find(p => !p.isTransitionPatch && p.state >= PatchState.Filled)
    })
    let count = 0
    for (const patch of this.patches.transition) {
      await new Promise(resolve => setTimeout(resolve, 0))
      const patchBlocks = patch.genGroundBlocks()
      patch.genEntitiesBlocks(patchBlocks, patch.spawnedEntities)
      count++
      this.patches.pending.push(patch)
      yield patchBlocks
    }

    elapsedTime = Date.now() - elapsedTime
    const avgTime = Math.round(elapsedTime / this.count)
    console.log(
      `processed ${this.count} transition patches in ${elapsedTime} ms (avg ${avgTime} ms per patch) `,
    )
    this.elapsedTime += elapsedTime
    this.count += count
  }

  finaliseBatch() {
    let elapsedTime = Date.now()
    // finalize patches skipping already
    const count = this.patches.pending
      .map(patch => patch.finalise())
      .filter(val => val)
    elapsedTime = Date.now() - elapsedTime
    console.log(`finalising batch took ${elapsedTime}ms for ${count} items`)
    this.elapsedTime += elapsedTime
    const avgTime = Math.round(this.elapsedTime / this.count)
    console.log(
      `[BatchProcessing] DONE processed ${this.count} patches in ${this.elapsedTime} ms (avg ${avgTime} ms per patch) `,
    )
  }
}
