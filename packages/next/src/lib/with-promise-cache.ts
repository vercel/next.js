/* eslint-disable no-redeclare */
import type { LRUCache } from 'next/dist/compiled/lru-cache'

export function withPromiseCache<K extends {}, V>(
  cache: LRUCache<K, Promise<V>>,
  fn: (value: K) => Promise<V>
): (value: K) => Promise<V>
export function withPromiseCache<T extends any[], K extends {}, V>(
  cache: LRUCache<K, Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey: (...values: T) => K
): (...values: T) => Promise<V>
export function withPromiseCache<T extends any[], K extends {}, V>(
  cache: LRUCache<K, Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey?: (...values: T) => K
): (...values: T) => Promise<V> {
  return (...values: T) => {
    const key = getKey ? getKey(...values) : values[0]
    let p = cache.get(key)
    if (!p) {
      p = fn(...values)
      p.catch(() => cache.delete(key))
      cache.set(key, p)
    }
    return p
  }
}
