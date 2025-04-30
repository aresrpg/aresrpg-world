import { Vector2 } from 'three'

import { patchIndexFromMapRange, patchRangeFromMapCenterRad } from '../utils/patch_chunk.js'
import { PatchKey } from '../utils/common_types.js'
import { ChunksTask } from '../processing/ChunksProcessing.js'

export type PatchViewState = {
    viewPos: Vector2
    viewRange: number
}

export class PatchPolling {
    // taskIndex: Record<TaskId, GenericTask> = {}
    viewState: PatchViewState = {
        viewPos: new Vector2(NaN, NaN),
        viewRange: 0,
    }

    patchstate = {
        postponed: [],
        removed: [],
        added: [],
    }

    patchIndex: Record<PatchKey, any> = {}
    // processedChunksQueue = []
    onPatch: any
    postponedTasks: ChunksTask[] = []
    pendingTasks: ChunksTask[] = []

    get visiblePatchKeys() {
        return Object.keys(this.patchIndex)
    }

    get mapPatchRange() {
        const { viewPos, viewRange } = this.viewState
        return patchRangeFromMapCenterRad(viewPos, viewRange)
    }

    viewStateChanged(viewPos: Vector2, viewRange: number) {
        const { viewState } = this
        const viewChanged = viewState.viewPos.distanceTo(viewPos) > 0 || viewState.viewRange !== viewRange
        return viewChanged
    }

    schedulePatches(patchIndex: Record<PatchKey, boolean>) {
        const scheduledPatches = Object.keys(patchIndex).filter(patchKey => !this.patchIndex[patchKey])
        return scheduledPatches
    }

    /**
     * look for chunks required each time view state changes
     * and schedule related tasks
     */
    pollData(patchPos: Vector2, patchViewRange: number) {
        if (this.viewStateChanged(patchPos, patchViewRange)) {
            this.viewState.viewPos = patchPos
            this.viewState.viewRange = patchViewRange
            // regen patch index from current view
            const patchIndex = patchIndexFromMapRange(this.mapPatchRange)
            // ret scheduled tasks
            const scheduledPatches = this.schedulePatches(patchIndex)
            // update chunks index
            this.patchIndex = patchIndex
            return scheduledPatches
        }
        return null
    }
}
