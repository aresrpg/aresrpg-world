export class LinkedList<T> {
    constructor(data: T) {
        this.data = data
    }

    data: T
    // eslint-disable-next-line no-use-before-define
    prev: LinkedList<T> | undefined
    // eslint-disable-next-line no-use-before-define
    next: LinkedList<T> | undefined
    // finder?: (item: T, val: any) => boolean

    insertItem(data: T) {
        const item = new LinkedList<T>(data)
        const backup = this.next
        this.next = item
        item.prev = this
        if (backup) {
            item.next = backup
            backup.prev = item
        }
        return item
    }

    get first() {
        const items = this.backwardIter()
        let first = this as LinkedList<T>
        for (const item of items) {
            first = item
        }
        return first
    }

    get last() {
        const items = this.forwardIter()
        let last = this as LinkedList<T>
        for (const item of items) {
            last = item
        }
        return last
    }

    nth(n: number) {
        let curr: LinkedList<T> | undefined = this.first
        let i = 1
        while (curr.next && i < n) {
            curr = curr.next
            i++
        }
        return curr
    }

    get index() {
        let i = 1
        let curr: LinkedList<T> | undefined = this
        while (curr?.prev) {
            curr = curr.prev
            i++
        }
        return i
    }

    *backwardIter() {
        let curr: LinkedList<T> | undefined = this
        // yield curr
        // do{
        //   yield curr.prev
        // }while(curr.prev)
        while (curr) {
            yield curr
            curr = curr.prev
        }
    }

    *forwardIter() {
        let curr: LinkedList<T> | undefined = this
        while (curr) {
            yield curr
            curr = curr.next
        }
    }

    asArray() {
        const elements: T[] = []
        let curr: LinkedList<T> | undefined = this.first
        while (curr) {
            elements.push(curr.data)
            curr = curr.next
        }
        return elements
    }

    // find(val: any) {
    //   let match = this.first()
    //   while (match && !this.finder?.(match, val)) {
    //     match = match.next
    //   }
    //   return match
    // }
}

export type RangeThreshold = {
    threshold: number
    transition?: number
    key?: string
}

export type NoiseLayerData<DataType> = {
    threshold: number
    transition?: number
    key?: string
} & DataType


export class RangesLinkedList<T extends RangeThreshold> extends LinkedList<T> {
    /**
     * find element index with inputVal within range
     * @param inputVal
     * @returns
     */
    findMatchingIndex(inputVal: number) {
        let match = this.first
        let i = 1
        while (match.next && inputVal > match.next.data.threshold) {
            match = match.next
            i++
        }
        return i
    }

    findMatchingElement(inputVal: number) {
        const matchingIndex = this.findMatchingIndex(inputVal)
        return this.first.nth(matchingIndex)
    }

    // fromArray(dataElements: T[], sortItems = true) {
    //     const sortedData = sortItems ? dataElements.sort((a, b) => a.level - b.level) : dataElements
    //     sortedData.forEach(item => this.last.insertItem(item))
    //     return this.first
    // }

    static fromArrayStub<U extends RangeThreshold>(rangesData: U[], sortItems = true) {
        const sortedRanges = sortItems ? rangesData.sort((a, b) => a.threshold - b.threshold) : rangesData
        const [begin, ...nextItems] = sortedRanges
        const res = begin ? new RangesLinkedList<U>(begin) : null
        res && nextItems.forEach(item => res.last.insertItem(item))
        return res
    }

    static fromIndexStub<U extends RangeThreshold>(rangesIndex: Record<string, U>, sortItems = true) {
        const ranges = Object.entries(rangesIndex).map(([key, rangeData]) => ({ ...rangeData, key }))
        return this.fromArrayStub(ranges, sortItems)
    }

    toIndexStub() {
        const stub: Record<string, T> = {}
        this.asArray().map((dataElement, i) => stub[dataElement.key || `${i}`] = dataElement)
    }
}