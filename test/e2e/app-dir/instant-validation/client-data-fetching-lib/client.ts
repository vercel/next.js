import 'client-only'
import { use } from 'react'
import { CacheIdentifierContext } from './internal-context'

export interface CacheIdentifier {}
const cacheById = new WeakMap<CacheIdentifier, DataCache>()

export type DataCache = Map<string, Promise<unknown>>

function createDataCache(): DataCache {
  return new Map()
}

export function useDataCache() {
  const id = use(CacheIdentifierContext)
  if (id === null) {
    throw new Error('Missing DataCacheProvider')
  }

  let cache = cacheById.get(id)
  if (!cache) {
    cacheById.set(id, (cache = createDataCache()))
  }
  return {
    getOrLoad<T>(key: string, func: () => Promise<T>): Promise<T> {
      let promise = cache.get(key) as Promise<T> | undefined
      if (!promise) {
        console.log('client-data-fetching-lib :: MISS', key)
        cache.set(key, (promise = func()))
      } else {
        console.log('client-data-fetching-lib :: HIT', key)
      }
      return promise
    },
  }
}
