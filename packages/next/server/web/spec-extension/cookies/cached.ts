/**
 * A simple caching behavior.
 * We cache the result based on the key `K`
 * which uses referential equality, to avoid re-computing
 * the result for the same key.
 */
export function cached<K, V>(generate: (key: K) => V) {
  let cache: { key: K; value: V } | undefined = undefined
  return (key: K) => {
    if (cache?.key !== key) {
      cache = { key, value: generate(key) }
    }

    return cache.value
  }
}
