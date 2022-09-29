declare function createCaches():
  | undefined
  | {
      cacheStorage: () => CacheStorage
      Cache: typeof Cache
      CacheStorage: typeof CacheStorage
    }

declare const caches: CacheStorage

declare const CacheStorageConstructor: typeof CacheStorage
declare const CacheConstructor: typeof Cache

export { CacheConstructor as Cache, CacheStorageConstructor as CacheStorage, caches, createCaches };
