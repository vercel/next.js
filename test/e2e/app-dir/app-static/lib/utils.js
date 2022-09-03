// TODO: replace use/cache with react imports when available
export const cache = (cb, ...args) => cb(...args)

const resolved = {}
export const use = (promise) => {
  const cached = resolved[promise]
  if (cached) {
    delete resolved[promise]
    return cached
  }
  promise.then((res) => {
    resolved[promise] = res
  })
  throw promise
}
