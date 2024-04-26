export class LinkedList<T> {
  constructor(data: T) {
    this.data = data
  }

  data: T
  // eslint-disable-next-line no-use-before-define
  next: LinkedList<T> | undefined

  static fromArray<U>(
    itemsData: U[]
  ): LinkedList<U> {
    const items = itemsData.map(data => new LinkedList<U>(data))
    // link items together
    items.reduce((prev, curr) => {
      prev.next = curr
      return curr
    })
    return items[0] as LinkedList<U>
  }

  static fromArraWithSorting<U>(
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

  static toDataArray(firstItem: LinkedList<any>) {
    const items = [firstItem.data]
    let item = firstItem
    while (item.next) {
      items.push(item.next.data)
      item = item.next
    }
    return items
  }

  static toArray(firstItem: LinkedList<any>) {
    const items = [firstItem]
    let item = firstItem
    while (item.next) {
      items.push(item.next)
      item = item.next
    }
    return items
  }

  static getAtIndex(firstItem: LinkedList<any>, itemIndex: number) {
    let item = firstItem
    let index = 0
    while (item.next && index < itemIndex) {
      item = item.next
      index++
    }
    return item
  }

  // static getLayer(layerChain: GenLayer, layerName: string) {
  //   let layer = layerChain
  //   while (layer.name !== layerName && layer.next) {
  //     layer = layer.next
  //   }
  //   return layer
  // }
}
