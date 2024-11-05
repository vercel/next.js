import { UseCacheCacheStore, FetchCacheStore } from './cache-store'

/**
 * An immutable version of the resume data cache.
 */
export interface ImmutableResumeDataCache {
  /**
   * The cache store for the "use cache" cache.
   */
  readonly cache: Omit<UseCacheCacheStore, 'set' | 'seal'>

  /**
   * The cache store for the fetch cache.
   */
  readonly fetch: Omit<FetchCacheStore, 'set' | 'seal'>
}

/**
 * A mutable version of the resume data cache.
 */
export interface MutableResumeDataCache {
  /**
   * The cache store for the "use cache" cache.
   */
  readonly cache: UseCacheCacheStore

  /**
   * The cache store for the fetch cache.
   */
  readonly fetch: FetchCacheStore
}

/**
 * Creates a new mutable resume data cache. This cache can be mutated and then
 * sealed to create an immutable version of the cache.
 */
export function createMutableResumeDataCache(): MutableResumeDataCache {
  return {
    cache: new UseCacheCacheStore(),
    fetch: new FetchCacheStore(),
  }
}

/**
 * Seals a mutable resume data cache to create an immutable version of the
 * cache.
 */
export function sealResumeDataCache(
  mutableResumeDataCache: MutableResumeDataCache
): ImmutableResumeDataCache {
  // Prevent further mutations by sealing the cache entries.
  mutableResumeDataCache.cache.seal()
  mutableResumeDataCache.fetch.seal()

  return {
    cache: mutableResumeDataCache.cache,
    fetch: mutableResumeDataCache.fetch,
  }
}
