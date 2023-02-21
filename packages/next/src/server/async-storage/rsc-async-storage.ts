import type { AsyncLocalStorage } from 'async_hooks'

type RSCStore = {
  __next_require__: any
}

let asyncLocalStorage: AsyncLocalStorage<RSCStore> | undefined

if (process.env.NEXT_RUNTIME !== 'edge') {
  const { createAsyncLocalStorage } =
    require('../../client/components/async-local-storage') as typeof import('../../client/components/async-local-storage')
  asyncLocalStorage = createAsyncLocalStorage()
}

function getRSCStorage() {
  if (asyncLocalStorage) {
    return asyncLocalStorage.getStore()
  }
  return undefined
}

export function runWithRSCStorage<T>(store: RSCStore, callback: () => T): T {
  // Patch global require and chunk loading for Flight client.

  // @ts-ignore
  globalThis.__next_require__ = (...args) => {
    const rscStore = getRSCStorage() || store
    return rscStore.__next_require__(...args)
  }

  // @ts-ignore
  globalThis.__next_chunk_load__ = () => Promise.resolve()

  if (asyncLocalStorage) {
    return asyncLocalStorage.run(store, callback)
  }
  return callback()
}
