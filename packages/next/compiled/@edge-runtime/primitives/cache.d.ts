export function createCaches(): {
  cacheStorage: () => CacheStorage
  Cache: typeof Cache
  CacheStorage: typeof CacheStorage
}

export const caches: CacheStorage

declare const CacheStorageConstructor: typeof CacheStorage
declare const CacheConstructor: typeof Cache

export { CacheStorageConstructor as CacheStorage }
export { CacheConstructor as Cache }
