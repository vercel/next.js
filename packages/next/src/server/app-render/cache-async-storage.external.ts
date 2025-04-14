import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { cacheAsyncStorageInstance } from './cache-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

export interface CommonCacheStore {
  /**
   * Collected revalidate time in seconds for the cache scope, including inner
   * scopes. `0` means dynamic. `INFINITE_CACHE` and higher means never
   * revalidate.
   */
  revalidate: number
  /**
   * Collected server expiration time in seconds for the cache scope, including
   * inner scopes.
   */
  expire: number
  /**
   * Collected client expiration time in seconds for the cache scope, including
   * inner scopes.
   */
  stale: number
  /**
   * Collected tags for the cache scope, including inner scopes.
   */
  tags: string[]
}

export interface RouteCacheStore extends CommonCacheStore {
  type: 'route'
}

export interface UseCacheStore extends CommonCacheStore {
  type: 'cache'
  /**
   * Explicit revalidate time in seconds for the cache scope, excluding inner
   * scopes.
   */
  explicitRevalidate: undefined | number
  /**
   * Explicit server expiration time in seconds for the cache scope, excluding
   * inner scopes.
   */
  explicitExpire: undefined | number
  /**
   * Explicit client expiration time in seconds for the cache scope, excluding
   * inner scopes.
   */
  explicitStale: undefined | number
}

export interface UnstableCacheStore extends CommonCacheStore {
  type: 'unstable-cache'
}

export type CacheStore = RouteCacheStore | UseCacheStore | UnstableCacheStore
export type CacheAsyncStorage = AsyncLocalStorage<CacheStore>

export { cacheAsyncStorageInstance as cacheUnitAsyncStorage }
