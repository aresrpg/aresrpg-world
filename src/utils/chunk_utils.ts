import { ChunkContainer } from '../datacontainers/ChunkContainer.js'

import { parseThreeStub } from './patch_chunk.js'

export const concatData = (data: Uint8Array[]) => {
  // build headers
  const headerLength = 4 // allocate 4 bytes per header to store content size
  const items = data.map(content => {
    const contentSize = content.length
    const header = new Uint8Array(headerLength)
    new DataView(header.buffer).setUint32(0, contentSize, true)
    return { content, header }
  })
  const concatSize = items.reduce(
    (sum, item) => sum + item.header.length + item.content.length,
    0,
  )
  const dataConcat = new Uint8Array(concatSize)

  let offset = 0

  for (const item of items) {
    const { header, content } = item
    dataConcat.set(header, offset)
    offset += header.length
    dataConcat.set(content, offset)
    offset += content.length
  }

  return dataConcat
}

export const deconcatData = (concatenatedData: Uint8Array): Uint8Array[] => {
  const headerLength = 4 // 4 bytes storing content size)
  const items: Uint8Array[] = []
  let offset = 0

  while (offset < concatenatedData.length) {
    // read content size from header (4 bytes)
    const contentSize = new DataView(concatenatedData.buffer).getUint32(
      offset,
      true,
    )
    offset += headerLength // move past the header

    // extract content based on the size from the header
    const content = concatenatedData.slice(offset, offset + contentSize)
    items.push(content)
    offset += contentSize // move to next chunk
  }

  return items
}

export const concatBlobs = (blobs: Blob[]) => {
  const count = blobs.length
  const headerSize = 1 + count * 2
  const blobHeader = [count, ...blobs.map(blob => blob.size + headerSize)]
  const headerBlob = new Blob([new Uint8Array(blobHeader)])
  const concat = new Blob([headerBlob, ...blobs])
  return concat
}

export const chunksToCompressedBlob = async (chunks: ChunkContainer[]) => {
  const allStubsConcat = chunks.map(chunk => chunk.toStubConcat())
  const total = allStubsConcat.reduce((sum, arr) => sum + arr.length, 0)

  const allStubsCombined = new Uint8Array(total)
  let offset = 0

  allStubsConcat.forEach(stubConcat => {
    allStubsCombined.set(stubConcat, offset)
    offset += stubConcat.length
  })

  // eslint-disable-next-line no-undef
  const concatBlob = new Blob([allStubsCombined.buffer as BlobPart])
  const compressionStream = concatBlob
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const compressedBlob = await new Response(compressionStream).blob()
  console.log(compressedBlob)
  return compressedBlob
}

export const chunksFromCompressedBlob = async (compressedBlob: Blob) => {
  try {
    // decompress
    const streamDecomp = compressedBlob
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    const blobContent = await new Response(streamDecomp).arrayBuffer()
    // deconcat
    const chunkStubs = []
    let leftItems = deconcatData(new Uint8Array(blobContent))
    console.log(leftItems.length)
    while (leftItems.length) {
      const [metadataContent, rawdataContent, ...leftContent] = leftItems
      const metadata = JSON.parse(new TextDecoder().decode(metadataContent))
      metadata.bounds = parseThreeStub(metadata.bounds)
      const rawdata =
        rawdataContent && rawdataContent.byteLength > 0
          ? new Uint16Array(rawdataContent.buffer)
          : new Uint16Array(0)

      const chunkStub = { metadata, rawdata }
      chunkStubs.push(chunkStub)
      leftItems = leftContent
    }
    return chunkStubs
  } catch (error) {
    console.error('Error occured during blob decompression:', error)
    throw new Error('Failed to process the compressed blob')
  }
}
