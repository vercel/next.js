export function consumeIterator(iter: Iterator<any>) {
  while (true) {
    const { value, done } = iter.next()
    if (done) {
      return value
    }
  }
}

export class LruCache {
  maxSize: number
  map: Map<any, any>

  constructor(maxSize: number = 200) {
    this.maxSize = maxSize
    this.map = new Map()
  }

  get(key: any) {
    const val = this.map.get(key)
    if (val === undefined) {
      return undefined
    }
    // Reset the insert-order of `key` to most-recent.
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: any, val: any) {
    if (this.map.size === this.maxSize) {
      // Map iterates over keys in insertion order.
      this.map.delete(this.map.keys().next().value)
    }
    this.map.set(key, val)
  }

  has(key: any) {
    return this.map.has(key)
  }
}
