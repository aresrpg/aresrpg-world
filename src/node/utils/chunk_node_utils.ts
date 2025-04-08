const { subtle } = globalThis.crypto

export const hashContent = async (content: ArrayBuffer, accuracy?: number) => {
    // Compute SHA-256 hash
    const hashBuffer = await subtle.digest('SHA-256', content)
    // Convert ArrayBuffer to byte array
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    // Convert to hexadecimal string
    const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
    return hashHex.slice(0, accuracy)
}
