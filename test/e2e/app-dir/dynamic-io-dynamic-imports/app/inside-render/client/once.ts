import type { WorkUnitStore } from 'next/dist/server/app-render/work-unit-async-storage.external'

/** Memoize a callback to only invoke it once. */
export function once<T>(cb: () => T) {
  let cache: null | { value: T } = null
  return () => {
    if (!cache) {
      cache = { value: cb() }
    }
    return cache.value
  }
}

/** A ponyfill of `React.cache` for client modules. This is a workaround, see callsites for motivation. */
export function oncePerRender<T>(cb: () => T) {
  if (typeof window !== 'undefined') {
    return once(cb)
  } else {
    let callbackWithoutStore: (() => T) | null = null
    const callbacksByStore = new WeakMap<WorkUnitStore, () => T>()
    const { workUnitAsyncStorage } =
      require('next/dist/server/app-render/work-unit-async-storage.external') as typeof import('next/dist/server/app-render/work-unit-async-storage.external')
    return () => {
      let cachedCb: () => T
      const workUnitStore = workUnitAsyncStorage.getStore()
      if (!workUnitStore) {
        if (!callbackWithoutStore) {
          callbackWithoutStore = once(cb)
        }
        cachedCb = callbackWithoutStore
      } else {
        let callbackForStore = callbacksByStore.get(workUnitStore)
        if (!callbackForStore) {
          callbacksByStore.set(workUnitStore, (callbackForStore = once(cb)))
        }
        cachedCb = callbackForStore
      }

      return cachedCb()
    }
  }
}
