// From http://baagoe.com/en/RandomMusings/javascript/

interface RandomFunction {
    (): number
    next: () => number
    uint32: () => number
    fract53: () => number
    version: string
    args: any[]
    exportState: () => [number, number, number, number]
    importState: (state: [number, number, number, number]) => void
}

function Mash(): (data: any) => number {
    let n = 0xefc8249d

    const mash = (data: any): number => {
        const str = String(data)
        for (let i = 0; i < str.length; i++) {
            n += str.charCodeAt(i)
            let h = 0.02519603282416938 * n
            n = h >>> 0
            h -= n
            h *= n
            n = h >>> 0
            h -= n
            n += h * 0x100000000 // 2^32
        }
        return (n >>> 0) * 2.3283064365386963e-10 // 2^-32
    }

    ;(mash as any).version = 'Mash 0.9'
    return mash
}

export default function Alea(...args: any[]): RandomFunction {
    let s0 = 0
    let s1 = 0
    let s2 = 0
    let c = 1

    if (args.length === 0) {
        args = [+new Date()]
    }

    let mash = Mash()
    s0 = mash(' ')
    s1 = mash(' ')
    s2 = mash(' ')

    for (let i = 0; i < args.length; i++) {
        s0 -= mash(args[i])
        if (s0 < 0) s0 += 1
        s1 -= mash(args[i])
        if (s1 < 0) s1 += 1
        s2 -= mash(args[i])
        if (s2 < 0) s2 += 1
    }
    mash = null as any

    const random = function (): number {
        const t = 2091639 * s0 + c * 2.3283064365386963e-10 // 2^-32
        s0 = s1
        s1 = s2
        return (s2 = t - (c = t | 0))
    } as RandomFunction

    random.next = random
    random.uint32 = (): number => random() * 0x100000000 // 2^32
    random.fract53 = (): number => random() + ((random() * 0x200000) | 0) * 1.1102230246251565e-16 // 2^-53
    random.version = 'Alea 0.9'
    random.args = args

    random.exportState = (): [number, number, number, number] => [s0, s1, s2, c]
    random.importState = (state: [number, number, number, number]): void => {
        s0 = +state[0] || 0
        s1 = +state[1] || 0
        s2 = +state[2] || 0
        c = +state[3] || 0
    }

    return random
}
