export function createAfterCurrentTest() {
  const afterCurrentTestCallbacks = new Set<() => Promise<void>>()

  afterEach(async () => {
    const callbacks = afterCurrentTestCallbacks
    afterCurrentTestCallbacks.clear()
    for (const callback of callbacks) {
      await callback()
    }
  })

  return function afterCurrentTest(cb: () => void | Promise<void>) {
    const wrapped = async () => {
      try {
        await cb()
      } finally {
        afterCurrentTestCallbacks.delete(wrapped)
      }
    }
    afterCurrentTestCallbacks.add(wrapped)
  }
}
