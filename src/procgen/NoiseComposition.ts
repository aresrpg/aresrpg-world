/**
 * blend threshold and transition
 */
export type LayerTransition = {
    lower: number
    upper: number
}

export type Compositor = (base: number, val: number, weight: number) => number

export enum BlendMode {
    ADD = 'addition',
    SUB = 'difference',
    MUL = 'product',
    DIV = 'division',
    MIN = 'brighter',
    MAX = 'darker',
}

/**
 * @param mode
 * @returns compositor function
 */
export const getCompositor = (blendMode: BlendMode): Compositor => {
    switch (blendMode) {
        case BlendMode.ADD:
            return (b, v, w) => b + w * v
        case BlendMode.SUB:
            return (b, v, w) => b - w * v
        case BlendMode.MUL:
            return (b, v, w) => b * w * v
        case BlendMode.DIV:
            return (b, v, w) => b / (w * v)
        case BlendMode.MIN:
            return (b, v, w) => Math.max(b, w * v)
        case BlendMode.MAX:
            return (b, v, w) => Math.min(b, w * v)
    }
}
