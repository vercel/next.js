import type { LRUCache } from '../server/lib/lru-cache'

/* eslint-disable no-redeclare */
export function withPromiseCache<K, V>(
  cache: LRUCache<Promise<V>>,
  fn: (value: K) => Promise<V>
): (value: K) => Promise<V>
export function withPromiseCache<T extends any[], K, V>(
  cache: LRUCache<Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey: (...values: T) => K
): (...values: T) => Promise<V>
export function withPromiseCache<T extends any[], K, V>(
  cache: LRUCache<Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey?: (...values: T) => K
): (...values: T) => Promise<V> {
  return (...values: T) => {
    const key = getKey ? getKey(...values) : values[0]
    let p = cache.get(key)
    if (!p) {
      p = fn(...values)
      p.catch(() => cache.remove(key))
      cache.set(key, p)
    }
    return p
  }
}
