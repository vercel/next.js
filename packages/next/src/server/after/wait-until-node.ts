/** A polyfill of waitUntil for non-serverless environments */
export function createStandaloneWaitUntil(
  onClose: (callback: () => void) => void
) {
  const promises = new Set<Promise<unknown>>()

  let closeListenerAdded = false
  const waitUntil = (promise: Promise<any>) => {
    // only add onClose when actually needed, because it's expensive for WebNextResponse
    if (!closeListenerAdded) {
      onClose(() => finish())
      closeListenerAdded = true
    }
    promises.add(promise.catch(() => {}))
  }

  const finish = async () => {
    await Promise.allSettled([...promises.values()])
  }

  return waitUntil
}
