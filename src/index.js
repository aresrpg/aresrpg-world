import { BLOCKS_BY_NAME } from '@aresrpg/aresrpg-protocol'

import { Noises } from './noise'
import { shape_height } from './pass/shape'

export const CHUNK_SIZE = 16

export class World {
  constructor(seed) {
    const noises = Noises(seed)
    this.pass = {
      shape: shape_height(noises),
    }
  }

  get_biome(x, y) {}

  // Simplified example, assuming BLOCKS_BY_NAME includes various types
  get_block(x, y, z) {
    return Math.round(this.get_height(x, z)) === y
      ? BLOCKS_BY_NAME.STONE
      : BLOCKS_BY_NAME.AIR
  }

  get_height(x, z) {
    return this.pass.shape(x, z)
  }

  get_chunk(cx, cy, cz) {
    const bitmap = []
    const block_types = []
    let bit_index = 0

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const block_type = this.get_block(
            cx * CHUNK_SIZE + x,
            cy * CHUNK_SIZE + y,
            cz * CHUNK_SIZE + z,
          )

          if (block_type) {
            set_bit(bitmap, bit_index)
            block_types.push(block_type)
          }
          bit_index++
        }
      }
    }

    return serialize_chunk_data(bitmap, block_types)
  }
}

function set_bit(arr, index) {
  const byte_index = Math.floor(index / 8)
  if (byte_index >= arr.length) arr.push(0) // Ensure the array is large enough
  const bit_index = index % 8
  arr[byte_index] |= 1 << bit_index // Set bit to 1
}

function serialize_chunk_data(bitmap, block_types) {
  if (!block_types.length) return new ArrayBuffer(0) // No blocks in chunk

  const block_types_length = block_types.length
  const data = new Uint8Array(2 + bitmap.length + block_types_length)
  // Store the length of the block_types array in the first 2 bytes
  data[0] = block_types_length & 0xff
  data[1] = (block_types_length >> 8) & 0xff
  // Copy bitmap
  data.set(new Uint8Array(bitmap), 2)
  // Copy block types
  data.set(new Uint8Array(block_types), 2 + bitmap.length)

  return data.buffer // ArrayBuffer suitable for WebSocket transmission
}

export function deserialize_chunk_data(data) {
  const buffer = new Uint8Array(data)

  if (!buffer.length)
    return { bitmap: new Uint8Array(0), block_types: new Uint8Array(0) }

  const block_types_length = buffer[0] | (buffer[1] << 8)
  const bitmap_length = buffer.length - 2 - block_types_length
  const bitmap = buffer.slice(2, 2 + bitmap_length)
  const block_types = buffer.slice(2 + bitmap_length)

  return { bitmap, block_types }
}
