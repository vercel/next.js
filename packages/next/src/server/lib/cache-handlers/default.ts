/*
  This is the default "use cache" handler it defaults
  to an in memory store
*/
import type { CacheEntry, CacheHandler } from './types'

interface DefaultCacheEntry extends CacheEntry {
  // For the default cache we store errored cache
  // entries and allow them to be used up to 3 times
  // after that we want to dispose it and try for fresh

  // If an entry is errored we return no entry
  // three times so that we retry hitting origin (MISS)
  // and then if it still fails to set after the third we
  // return the errored content and use expiration of
  // Math.min(30, entry.expiration)
  isErrored: boolean
  errorRetryCount: number

  // compute size on set since we need to read size
  // of the ReadableStream for LRU evicting
  size?: number
}

export class DefaultCacheHandler implements CacheHandler {
  // LRU cache default to max 50 MB but in future track

  memoryCache = new Map<string, DefaultCacheEntry>()

  async get(
    _cacheKey: Parameters<CacheHandler['get']>[0],
    _softTags: Parameters<CacheHandler['get']>[1]
  ) {
    // we need to be able to query the existing tags-manifest
    // that incremental-cache currently uses
    return undefined
  }

  async set(
    _cacheKey: Parameters<CacheHandler['set']>[0],
    _entry: Parameters<CacheHandler['set']>[1]
  ) {}

  async expireTags(..._tags: Parameters<CacheHandler['expireTags']>) {}

  async receiveExpiredTags(..._tags: string[]): Promise<void> {}
}
