// In-memory caches are fragile and should not use stale-while-revalidate
// semantics on the caches because it's not worth warming up an entry that's
// likely going to get evicted before we get to use it anyway. However,
// we also don't want to reuse a stale entry for too long so stale entries
// should be considered expired/missing in such CacheHandlers.

// This is the entry we store
export interface CacheEntry {
  /**
   * The ReadableStream can error and only have partial
   * data so any cache handlers need to handle this case
   * and decide to keep the partial cache around or not
   */
  value: ReadableStream<Uint8Array>

  /**
   * The tags configured for the entry excluding soft tags
   */
  tags: string[]

  /**
   * This is for the client not used to calculate cache entry expiration
   */
  stale: number

  /**
   * When the cache entry was created
   */
  timestamp: number

  /**
   * How long the entry can last (should be longer than revalidate)
   */
  expire: number

  /**
   * How long until the entry should revalidate
   */
  revalidate: number
}

export interface CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>

  set(cacheKey: string, entry: Promise<CacheEntry>): Promise<void>

  // This is called when expireTags('') is called
  // and should update tags manifest accordingly
  expireTags(...tags: string[]): Promise<void>

  // This is called when an action request sends
  // NEXT_CACHE_REVALIDATED_TAGS_HEADER and tells
  // us these tags are expired and the manifest
  // should be updated this differs since in a multi
  // instance environment you don't propagate these
  // as they are request specific
  receiveExpiredTags(...tags: string[]): Promise<void>
}
