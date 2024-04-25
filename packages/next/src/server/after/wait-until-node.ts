/** A polyfill of waitUntil for non-serverless environments */
export function createStandaloneWaitUntil() {
  const promises = new Set<Promise<unknown>>()

  const waitUntil = (promise: Promise<unknown>) => {
    promises.add(promise.catch(() => {}))
  }

  const finish = async () => {
    await Promise.allSettled([...promises.values()])
  }

  return { waitUntil, finish }
}
