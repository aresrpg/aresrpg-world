import { Box2, Vector3, Vector2 } from "three"
import { PatchKey } from "../common/types"
import { patchIdFromPos } from "../common/utils"
import { WorldConfig } from "../config/WorldConfig"

/**
 * Generic patch data container
 */
// GenericPatch
export interface PatchDataContainer {
  key: any
  bbox: any
  chunkIds: any
  duplicate(): PatchDataContainer | null
  toChunks(): any
}
/**
 * Map from patch aggregation
 */
export class PatchesMap<PatchType extends PatchDataContainer> {
  bbox: Box2 = new Box2()
  patchDimensions: Vector2
  patchLookup: Record<string, PatchType | null> = {}

  constructor(patchDim: Vector2) {
    this.patchDimensions = patchDim
  }

  initFromBoxAndMask(
    bbox: Box2,
    // patchDim: Vector2,
    // patchBboxFilter = (patchBbox: Box3) => patchBbox,
  ) {
    this.bbox = bbox
    // this.patchDimensions = patchDim
    this.patchLookup = {}
    // const halfDimensions = this.bbox.getSize(new Vector3()).divideScalar(2)
    // const range = BlocksPatch.asPatchCoords(halfDimensions)
    // const center = this.bbox.getCenter(new Vector3())
    // const origin = BlocksPatch.asPatchCoords(center)
    const { min, max } = this.patchRange
    for (let { x } = min; x < max.x; x++) {
      for (let { y } = min; y < max.y; y++) {
        const patchKey = `${x}:${y}`
        // const patchBox = patchBoxFromKey(patchKey, patchDim)
        // if (patchBboxFilter(patchBox)) {
        this.patchLookup[patchKey] = null
        // }
      }
    }
  }

  get patchRange() {
    const rangeMin = patchIdFromPos(this.bbox.min, this.patchDimensions)
    const rangeMax = patchIdFromPos(this.bbox.max, this.patchDimensions).addScalar(1)
    const patchRange = new Box2(rangeMin, rangeMax)
    return patchRange
  }

  get externalBbox() {
    const { min, max } = this.patchRange
    min.multiplyScalar(WorldConfig.patchSize)
    max.multiplyScalar(WorldConfig.patchSize)
    const extBbox = new Box2(min, max)
    return extBbox
  }

  get count() {
    return Object.keys(this.patchLookup).length
  }

  get patchKeys() {
    return Object.keys(this.patchLookup)
  }

  get chunkIds() {
    return this.availablePatches.map(patch => patch.chunkIds).flat()
  }

  get availablePatches() {
    return Object.values(this.patchLookup).filter(val => val) as PatchType[]
  }

  get missingPatchKeys() {
    return Object.keys(this.patchLookup).filter(
      key => !this.patchLookup[key],
    ) as PatchKey[]
  }

  // autoFill(fillingVal=0){
  //   this.patchKeys.forEach(key=>this.patchLookup[key] = new BlocksPatch(key))
  //   this.availablePatches.forEach(patch=>patch.iterOverBlocks)
  // }

  populateFromExisting(patches: PatchType[], cloneObjects = false) {
    // const { min, max } = this.bbox
    patches
      .filter(patch => this.patchLookup[patch.key] !== undefined)
      .forEach(patch => {
        this.patchLookup[patch.key] = cloneObjects ? patch.duplicate() : patch
        // min.y = Math.min(patch.bbox.min.y, min.y)
        // max.y = Math.max(patch.bbox.max.y, max.y)
      })
  }

  compareWith(otherContainer: PatchesMap<PatchType>) {
    const patchKeysDiff: Record<string, boolean> = {}
    // added keys e.g. keys in current container but not found in other
    Object.keys(this.patchLookup)
      .filter(patchKey => otherContainer.patchLookup[patchKey] === undefined)
      .forEach(patchKey => (patchKeysDiff[patchKey] = true))
    // missing keys e.g. found in other container but not in current
    Object.keys(otherContainer.patchLookup)
      .filter(patchKey => this.patchLookup[patchKey] === undefined)
      .forEach(patchKey => (patchKeysDiff[patchKey] = false))
    return patchKeysDiff
  }

  toChunks() {
    const exportedChunks = this.availablePatches
      .map(patch => patch.toChunks())
      .flat()
    return exportedChunks
  }

  findPatch(blockPos: Vector3) {
    // const point = new Vector3(
    //   inputPoint.x,
    //   0,
    //   inputPoint instanceof Vector3 ? inputPoint.z : inputPoint.y,
    // )

    const res = this.availablePatches.find(patch =>
      patch.containsBlock(blockPos),
    )
    return res
  }

  // getBlock(blockPos: Vector3) {
  //   return this.findPatch(blockPos)?.getBlock(blockPos, false)
  // }

  // getAllPatchesEntities(skipDuplicate = true) {
  //   const entities: EntityData[] = []
  //   for (const patch of this.availablePatches) {
  //     patch.entities.forEach(entity => {
  //       if (!skipDuplicate || !entities.find(ent => ent.bbox.equals(entity.bbox))) {
  //         entities.push(entity)
  //       }
  //     })
  //   }
  //   return entities
  // }

  // *iterAllPatchesBlocks() {
  //   for (const patch of this.availablePatches) {
  //     const blocks = patch.iterOverBlocks(undefined, false, false)
  //     for (const block of blocks) {
  //       yield block
  //     }
  //   }
  // }

  // getMergedRows(zRowIndex: number) {
  //   const sortedPatchesRows = this.availablePatches
  //     .filter(
  //       patch => zRowIndex >= patch.bbox.min.z && zRowIndex <= patch.bbox.min.z,
  //     )
  //     .sort((p1, p2) => p1.bbox.min.x - p2.bbox.min.x)
  //     .map(patch => patch.getBlocksRow(zRowIndex))
  //   const mergedRows = sortedPatchesRows.reduce((arr1, arr2) => {
  //     const mergedArray = new Uint32Array(arr1.length + arr2.length)
  //     mergedArray.set(arr1)
  //     mergedArray.set(arr2, arr1.length)
  //     return mergedArray
  //   })
  //   return mergedRows
  // }

  // iterMergedRows() {
  //   const { min, max } = this.patchRange
  //   for (let zPatchIndex = min.z; zPatchIndex <= max.z; zPatchIndex++) {
  //     for (let zRowIndex = min.z; zRowIndex < max.z; zRowIndex++) {}
  //   }
  // }

  // getMergedCols(xColIndex: number) {

  // }

  // mergedLinesIteration() {
  //   const { min, max } = this.bbox
  //   for (let x = min.x; x < max.x; x++) {
  //     for (let z = min.z; z < max.z; z++) {

  //     }
  //   }
  // }

  // toMergedContainer() {
  //   const mergedBox = this.availablePatches.map(patch => patch.bbox)
  //     .reduce((merge, bbox) => merge.union(bbox), new Box3())
  //   // const mergedContainer =
  // }

  // static fromMergedContainer() {

  // }
  // mergeBlocks(blocksContainer: BlocksContainer) {
  //   // // for each patch override with blocks from blocks container
  //   this.availablePatches.forEach(patch => {
  //     const blocksIter = patch.iterOverBlocks(blocksContainer.bbox)
  //     for (const target_block of blocksIter) {
  //       const source_block = blocksContainer.getBlock(target_block.pos, false)
  //       if (source_block && source_block.pos.y > 0 && target_block.index) {
  //         let block_type = source_block.type ? BlockType.SAND : BlockType.NONE
  //         block_type =
  //           source_block.type === BlockType.TREE_TRUNK
  //             ? BlockType.TREE_TRUNK
  //             : block_type
  //         const block_level = blocksContainer.bbox.min.y // source_block?.pos.y
  //         patch.writeBlock(target_block.index, block_level, block_type)
  //         // console.log(source_block?.pos.y)
  //       }
  //     }
  //   })
  // }
}

/**
 * Repeat patch pattern indefinitely to provide infinite map
 */
export class PatchRepeatMap<PatchType extends PatchDataContainer> extends PatchesMap<PatchType> {

}