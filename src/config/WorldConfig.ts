

export class WorldConfig {
    static patchSize = Math.pow(2, 6)
    static chunksYRange = {
        min: 0,
        max: 5
    }
    // max cache radius as a power of two
    static cachePowLimit = 2// 4 => 16 patches radius
}