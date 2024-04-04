export class LinkedList<T> {
  constructor(data: T) {
    this.data = data
  }

  data: T
  // eslint-disable-next-line no-use-before-define
  next: LinkedList<T> | undefined

  static fromArray<U>(
    itemsData: U[],
    compareFn: (a: U, b: U) => number,
  ): LinkedList<U> {
    const items = itemsData.sort(compareFn).map(data => new LinkedList<U>(data))
    // link items together
    items.reduce((prev, curr) => {
      prev.next = curr
      return curr
    })
    return items[0] as LinkedList<U>
  }
}
