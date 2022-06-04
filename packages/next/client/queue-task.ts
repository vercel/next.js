export function scheduleMicrotask(callback: () => void) {
  const promise = Promise.resolve()
  // Opt-in queueMicrotask if possible when react root is enabled, align with react 18
  if (process.env.__NEXT_REACT_ROOT && typeof queueMicrotask === 'function') {
    queueMicrotask(callback)
    return promise
  }
  return promise.then(callback)
}
