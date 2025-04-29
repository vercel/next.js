export function once<T>(cb: () => T) {
  let cache: null | { value: T } = null
  return () => {
    if (!cache) {
      cache = { value: cb() }
    }
    return cache.value
  }
}
