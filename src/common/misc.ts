export class LinkedList<T> {
  constructor(data: T) {
    this.data = data
  }

  data: T
  // eslint-disable-next-line no-use-before-define
  prev: LinkedList<T> | undefined
  next: LinkedList<T> | undefined
  // finder?: (item: T, val: any) => boolean

  first() {
    let curr: LinkedList<T> = this
    while (curr.prev) {
      curr = curr.prev
    }
    return curr
  }

  last() {
    let curr: LinkedList<T> = this
    while (curr.next) {
      curr = curr.next
    }
    return curr
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
