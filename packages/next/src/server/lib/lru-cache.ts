export class LRUCache<T> {
  private cache: Map<string, T>
  private sizes: Map<string, number>
  private totalSize: number
  private maxSize: number
  private calculateSize: (value: T) => number

  constructor(maxSize: number, calculateSize?: (value: T) => number) {
    this.cache = new Map()
    this.sizes = new Map()
    this.totalSize = 0
    this.maxSize = maxSize
    this.calculateSize = calculateSize || (() => 1)
  }

  set(key?: string | null, value?: T): void {
    if (!key || !value) return

    const size = this.calculateSize(value)

    if (size > this.maxSize) {
      console.warn('Single item size exceeds maxSize')
      return
    }

    if (this.cache.has(key)) {
      this.totalSize -= this.sizes.get(key) || 0
    }

    this.cache.set(key, value)
    this.sizes.set(key, size)
    this.totalSize += size

    this.touch(key)
  }

  has(key?: string | null): boolean {
    if (!key) return false

    this.touch(key)
    return Boolean(this.cache.get(key))
  }

  get(key?: string | null): T | undefined {
    if (!key) return

    const value = this.cache.get(key)
    if (value === undefined) {
      return undefined
    }

    this.touch(key)
    return value
  }

  private touch(key: string): void {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, value)
      this.evictIfNecessary()
    }
  }

  private evictIfNecessary(): void {
    while (this.totalSize > this.maxSize && this.cache.size > 0) {
      this.evictLeastRecentlyUsed()
    }
  }

  private evictLeastRecentlyUsed(): void {
    const lruKey = this.cache.keys().next().value
    if (lruKey !== undefined) {
      const lruSize = this.sizes.get(lruKey) || 0
      this.totalSize -= lruSize
      this.cache.delete(lruKey)
      this.sizes.delete(lruKey)
    }
  }

  reset() {
    this.cache.clear()
    this.sizes.clear()
    this.totalSize = 0
  }

  keys() {
    return [...this.cache.keys()]
  }

  remove(key: string): void {
    if (this.cache.has(key)) {
      this.totalSize -= this.sizes.get(key) || 0
      this.cache.delete(key)
      this.sizes.delete(key)
    }
  }

  clear(): void {
    this.cache.clear()
    this.sizes.clear()
    this.totalSize = 0
  }

  get size(): number {
    return this.cache.size
  }

  get currentSize(): number {
    return this.totalSize
  }
}
