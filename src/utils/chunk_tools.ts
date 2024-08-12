import { Box3, MathUtils, Vector3 } from "three"
import {
  BlocksContainer,
  BlocksPatch,
  BlockType,
  WorldUtils
} from '../index'

const DBG_BORDERS_HIGHLIGHT_COLOR = BlockType.SAND

// for debug use only
const highlightPatchBorders = (localPos: Vector3, blockType: BlockType) => {
  return DBG_BORDERS_HIGHLIGHT_COLOR && (localPos.x === 1 || localPos.z === 1) ?
    DBG_BORDERS_HIGHLIGHT_COLOR : blockType
}

const writeChunkBlocks = (
  chunkData: Uint16Array,
  chunkBbox: Box3,
  blockLocalPos: Vector3,
  groundType: BlockType,
  bufferOver = [],
) => {
  const chunk_size = Math.round(Math.pow(chunkData.length, 1 / 3))

  let written_blocks_count = 0

  const level = MathUtils.clamp(
    blockLocalPos.y + bufferOver.length,
    chunkBbox.min.y,
    chunkBbox.max.y,
  )
  let buff_index = Math.max(level - blockLocalPos.y, 0)
  let h = level - chunkBbox.min.y // local height
  // debug_mode && is_edge(local_pos.z, local_pos.x, h, patch_size - 2)
  //   ? BlockType.SAND
  //   : block_cache.type

  while (h >= 0) {
    const blocksIndex =
      blockLocalPos.z * Math.pow(chunk_size, 2) +
      h * chunk_size +
      blockLocalPos.x
    const blockType = buff_index > 0 ? bufferOver[buff_index] : groundType
    const skip =
      buff_index > 0 &&
      chunkData[blocksIndex] !== undefined &&
      !bufferOver[buff_index]
    if (!skip) {
      chunkData[blocksIndex] = blockType || BlockType.NONE
      // ? voxelmapDataPacking.encode(false, blockType)
      // : voxelmapDataPacking.encodeEmpty()
      blockType && written_blocks_count++
    }
    buff_index--
    h--
  }
  return written_blocks_count
}

const fillGroundData = (blocksContainer: BlocksContainer, chunkData: Uint16Array, chunkBox: Box3) => {
  let written_blocks_count = 0
  const blocks_iter = blocksContainer.iterOverBlocks(undefined, true, false)
  for (const block of blocks_iter) {
    const blockLocalPos = block.pos
    blockLocalPos.x += 1
    // blockLocalPos.y = patch.bbox.max.y
    blockLocalPos.z += 1
    const blockType = highlightPatchBorders(blockLocalPos, block.type) || block.type
    written_blocks_count += writeChunkBlocks(
      chunkData,
      chunkBox,
      blockLocalPos,
      blockType,
    )
  }
  return written_blocks_count
}

const fillEntitiesData = (blocksContainer: BlocksContainer, chunkData: Uint16Array, chunkBox: Box3) => {
  let written_blocks_count = 0
  // iter over container entities
  for (const entity_chunk of blocksContainer.entitiesChunks) {
    // const { min, max } = entity_chunk.bbox
    // const bmin = new Vector3(...Object.values(min))
    // const bmax = new Vector3(...Object.values(max))
    // const entity_bbox = new Box3(bmin, bmax)
    // find overlapping blocks between entity and container
    const blocks_iter = blocksContainer.iterOverBlocks(entity_chunk.bbox, true)
    let chunk_index = 0
    // iter over entity blocks
    for (const block of blocks_iter) {
      const bufferStr = entity_chunk.data[chunk_index]
      const buffer =
        bufferStr.length > 0 &&
        bufferStr.split(',').map(char => parseInt(char))
      if (buffer.length > 0) {
        block.buffer = buffer
        block.localPos.x += 1
        block.localPos.z += 1
        // bmin.y = block.localPos.y
        written_blocks_count += writeChunkBlocks(
          chunkData,
          chunkBox,
          block.localPos,
          block.type,
          block.buffer,
        )
      }
      chunk_index++
    }
  }
  return written_blocks_count
}

export const getChunkBbox = (chunk_id: Vector3) => {
  const bmin = chunk_id.clone().multiplyScalar(BlocksPatch.patchSize)
  const bmax = chunk_id.clone().addScalar(1).multiplyScalar(BlocksPatch.patchSize)
  const chunkBbox = new Box3(bmin, bmax)
  chunkBbox.expandByScalar(1)
  return chunkBbox
}

export function makeChunk(blocksContainer: BlocksContainer, chunk_id: Vector3) {
  const chunkBox = getChunkBbox(chunk_id)
  const final_chunk = makeCustomChunk(blocksContainer, chunkBox)
  final_chunk.id = chunk_id
  return final_chunk
}

export function makeCustomChunk(blocksContainer: BlocksContainer, chunkBox: Box3) {
  const chunk_dims = chunkBox.getSize(new Vector3())
  const chunkData = new Uint16Array(chunk_dims.x * chunk_dims.y * chunk_dims.z)
  let total_written_blocks_count = 0
  // const debug_mode = true

  // const is_edge = (row, col, h, patch_size) =>
  //   row === 1 || row === patch_size || col === 1 || col === patch_size
  // || h === 1
  // || h === patch_size - 2

  // const patch = PatchBlocksCache.instances.find(
  //   patch =>
  //     patch.bbox.min.x === bbox.min.x + 1 &&
  //     patch.bbox.min.z === bbox.min.z + 1 &&
  //     patch.bbox.max.x === bbox.max.x - 1 &&
  //     patch.bbox.max.z === bbox.max.z - 1 &&
  //     patch.bbox.intersectsBox(bbox),
  // )

  // multi-pass chunk filling
  if (blocksContainer) {
    // ground pass
    total_written_blocks_count += fillGroundData(
      blocksContainer,
      chunkData,
      chunkBox,
    )
    // overground entities pass
    total_written_blocks_count += fillEntitiesData(
      blocksContainer,
      chunkData,
      chunkBox,
    )
  }
  // const size = Math.round(Math.pow(chunk.data.length, 1 / 3))
  // const dimensions = new Vector3(size, size, size)
  const chunk = {
    data: chunkData,
    size: chunk_dims,
    isEmpty: total_written_blocks_count === 0,
  }
  return chunk
}

export function genChunkIds(patch: BlocksPatch, ymin: number, ymax: number) {
  const chunk_ids = []
  if (patch) {
    for (let y = ymax; y >= ymin; y--) {
      const chunk_coords = WorldUtils.asVect3(patch.coords, y)
      chunk_ids.push(chunk_coords)
    }
  }
  return chunk_ids
}

// const plateau_ground_pass = (blocksContainer, chunk) => {
//   const patch_center = blocksContainer.bbox.getCenter(new Vector3()) // patch.bbox.min.y
//   const plateau_height = Math.floor(patch_center.y)
//   const iter = blocksContainer.iterOverBlocks(undefined, true)
//   let res = iter.next()
//   while (!res.done) {
//     const block_data = res.value
//     const block_pos = block_data.pos.clone()
//     block_pos.x += 1
//     block_pos.y = plateau_height
//     block_pos.z += 1
//     const blockType = block_data.type
//     writeChunkBlocks(chunk, block_pos, blockType)
//     res = iter.next()
//   }
// }

// const buff_iter = patch_bis.overBlocksIter()
// for (const blk of buff_iter) {
//   blk.localPos.x += 1
//   blk.localPos.z += 1
//   writeChunkBlocks(chunk, blk.localPos, blk.type, blk.buffer)
// }

// export function get_plateau_chunks(plateau_keys) {
//   const chunks = []
//   plateau_keys.forEach(patch_key => {
//     const patch = WorldCache.patchLookupIndex[patch_key]
//     const chunks_ids = genChunkIds(patch_key)
//     patch &&
//       chunks_ids.forEach(chunk_coords => {
//         let is_empty = true
//         const bmin = chunk_coords.clone().multiplyScalar(world_patch_size)
//         const bmax = chunk_coords
//           .clone()
//           .addScalar(1)
//           .multiplyScalar(world_patch_size)
//         const chunkBbox = new Box3(bmin, bmax)
//         chunkBbox.expandByScalar(1)
//         const dimensions = chunkBbox.getSize(new Vector3())
//         const data = new Uint16Array(dimensions.x * dimensions.y * dimensions.z)
//         const chunk = { bbox: chunkBbox, data }

//         // multi-pass chunk filling
//         if (patch) {
//           // ground pass
//           // ground_blocks_pass(patch, chunk)
//           plateau_ground_pass(patch, chunk)
//           // overground entities pass
//           // plateau_entities_pass(patch, chunk)
//           // // extra blocks at edges from adjacent patches
//           edges_blocks_pass(chunk)
//           is_empty = false
//         }
//         // fill_chunk_plateau_from_patch(patch, chunkBbox)
//         const final_chunk = {
//           id: chunk_coords,
//           data,
//           size: dimensions,
//           isEmpty: false,
//         }
//         chunks.push(final_chunk)
//       })
//   })
//   return chunks
// }
