import { workAsyncStorage } from '../app-render/work-async-storage.external'

/**
 * Returns a promise that is resolved with `value`: the same promise for every
 * call with that value during a render.
 *
 * The promises are kept on the work store, so they are dropped together with
 * it. A module-level `WeakMap` that is keyed by `value` does not achieve that.
 * A promise references the value that it was resolved with, and V8's minor
 * garbage collections treat a `WeakMap` entry whose value references its key
 * as strongly held. The promise, and everything it references, would stay
 * until the next major garbage collection. In Node.js before 24, a promise
 * references every async local store that was active when it was created.
 *
 * `fallbackCache` is only used when no work store is active.
 */
export function getResolvedPromise<T extends object>(
  value: T,
  fallbackCache: WeakMap<object, Promise<T>>
): Promise<T> {
  const workStore = workAsyncStorage.getStore()
  const cache = workStore
    ? (workStore.resolvedPromises ??= new Map())
    : fallbackCache

  let promise = cache.get(value) as Promise<T> | undefined
  if (promise === undefined) {
    promise = Promise.resolve(value)
    cache.set(value, promise)
  }
  return promise
}
