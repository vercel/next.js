export function reactCache(fn) {
  return fn
}

export function cache(kind, id, boundArgsLength, fn, args) {
  return fn(...args)
}
