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

  first() {
    const items = this.backwardIter()
    let first = this as LinkedList<T>
    for (const item of items) {
      first = item
    }
    return first
  }

  last() {
    const items = this.forwardIter()
    let last = this as LinkedList<T>
    for (const item of items) {
      last = item
    }
    return last
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

  // find(val: any) {
  //   let match = this.first()
  //   while (match && !this.finder?.(match, val)) {
  //     match = match.next
  //   }
  //   return match
  // }

  static fromArray<U>(itemsData: U[]): LinkedList<U> {
    const items = itemsData.map(data => new LinkedList<U>(data))
    // link items together
    items.reduce((prev, curr) => {
      curr.prev = prev
      prev.next = curr
      return curr
    })
    return items[0] as LinkedList<U>
  }

  static fromArrayAfterSorting<U>(
    itemsData: U[],
    compareFn: (a: U, b: U) => number,
  ): LinkedList<U> {
    const items = itemsData.sort(compareFn).map(data => new LinkedList<U>(data))
    // link items together
    items.reduce((prev, curr) => {
      curr.prev = prev
      prev.next = curr
      return curr
    })
    return items[0] as LinkedList<U>
  }
}
