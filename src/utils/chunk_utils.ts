

const findBufferDelimiter = (rawdata: Buffer, delimiter: Buffer) => {
    for (let i = 0; i <= rawdata.length - delimiter.length; i++) {
        if (rawdata.slice(i, i + delimiter.length).equals(delimiter)) {
            return i;
        }
    }
    return -1
}

const findArrayDelimiter = (rawdata: Uint8Array, delimiter: Uint8Array) => {
    for (let i = 0; i <= rawdata.length - delimiter.length; i++) {
        if (rawdata.subarray(i, i + delimiter.length).every((value, idx) => value === delimiter[idx])) {
            return i;
        }
    }
    return -1
}

const uncompressData = async (rawdata: Buffer | ArrayBufferLike) => {
    const rawdataBlob = new Blob([rawdata])
    const decompressReadableStream = rawdataBlob.stream().pipeThrough(
        new DecompressionStream("gzip")
    );
    const resp = await new Response(decompressReadableStream);
    const array = await resp.arrayBuffer();
    const chunkRawData = new Uint16Array(array)

    return chunkRawData
}

export const chunkStubFromBlob = async (chunkBlob: Blob) => {
    const blobData = await chunkBlob.arrayBuffer()
    const dataArray = new Uint8Array(blobData)
    const delimiter = new Uint8Array([0xFF, 0xFF, 0xFF]);
    const separatorIndex = findArrayDelimiter(dataArray, delimiter)
    const rawMetadata = dataArray.slice(0, separatorIndex)
    const metadataStr = new TextDecoder('utf-8').decode(rawMetadata)
    const metadata = JSON.parse(metadataStr)
    const rawdataArray = dataArray.slice(separatorIndex + delimiter.length)
    const rawdata = await uncompressData(rawdataArray.buffer)
    const chunkStub = { metadata, rawdata }
    return chunkStub
}

export const chunkStubfromBlobBuffer = async (chunkBlobBuffer: Buffer) => {
    // extract metadata and compressed data blobs
    const blobsDelimiter = Buffer.from([0xFF, 0xFF, 0xFF])
    const separatorIndex = findBufferDelimiter(chunkBlobBuffer, blobsDelimiter)
    const rawMetadata = chunkBlobBuffer.slice(0, separatorIndex)
    const metadata = JSON.parse(rawMetadata.toString())
    console.log(metadata)
    const rawdataBlobBuffer = chunkBlobBuffer.slice(separatorIndex + blobsDelimiter.length)
    const rawdata = await uncompressData(rawdataBlobBuffer)
    const chunkStub = { metadata, rawdata }
    return chunkStub
}