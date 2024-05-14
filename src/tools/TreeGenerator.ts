export type TreeGenerator = (xzProj: number, y: number, range: number) => Boolean

export enum TreeType {
    PineTree = 'pine_tree',
    AppleTree = 'apple_tree',
}

const AppleTree = (xzProj: number, y: number, range: number) => {
    const dist = Math.sqrt(Math.pow(xzProj, 2) + Math.pow(y, 2))
    const isFoliage = dist <= range
    return isFoliage
}

const PineTree = (xzProj: number, y: number, range: number) => {
    const dist = xzProj // xzProj*(y+radius)
    const isFoliage = dist <= range * (1 - 0.35 * (y + range) / range)
    return isFoliage
}

export const TreeGenerators: Record<TreeType, TreeGenerator> = {
    [TreeType.AppleTree]: AppleTree,
    [TreeType.PineTree]: PineTree
}
