/* eslint-disable no-redeclare */
interface Cache<K, V> {
  set(key: K, value: V, maxAge?: number): boolean
  get(key: K): V | undefined
  del(key: K): void
}

export function withPromiseCache<K, V>(
  cache: Cache<K, Promise<V>>,
  fn: (value: K) => Promise<V>
): (value: K) => Promise<V>
export function withPromiseCache<T extends any[], K, V>(
  cache: Cache<K, Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey: (...values: T) => K
): (...values: T) => Promise<V>
export function withPromiseCache<T extends any[], K, V>(
  cache: Cache<K, Promise<V>>,
  fn: (...values: T) => Promise<V>,
  getKey?: (...values: T) => K
): (...values: T) => Promise<V> {
  return (...values: T) => {
    const key = getKey ? getKey(...values) : values[0]
    let p = cache.get(key)
    if (!p) {
      p = fn(...values)
      p.catch(() => cache.del(key))
      cache.set(key, p)
    }
    return p
  }
}
