export function createWaiter() {
  let cached = null
  function wait() {
    if (typeof window === 'undefined') {
      if (cached) {
        return cached
      }
      cached = new Promise((r) => process.nextTick(r))
      return cached
    } else {
      if (cached) {
        return cached
      }
      cached = Promise.resolve()
      return cached
    }
  }

  function cleanup() {
    cached = null
  }
  return { wait, cleanup }
}
