/**
 * A timestamp in milliseconds elapsed since the epoch
 */
export type Timestamp = number

export interface CacheEntry {
  /**
   * The ReadableStream can error and only have partial data so any cache
   * handlers need to handle this case and decide to keep the partial cache
   * around or not.
   */
  value: ReadableStream<Uint8Array>

  /**
   * The tags configured for the entry excluding soft tags
   */
  tags: string[]

  /**
   * This is for the client, not used to calculate cache entry expiration
   * [duration in seconds]
   */
  stale: number

  /**
   * When the cache entry was created [timestamp in milliseconds]
   */
  timestamp: Timestamp

  /**
   * How long the entry is allowed to be used (should be longer than revalidate)
   * [duration in seconds]
   */
  expire: number

  /**
   * How long until the entry should be revalidated [duration in seconds]
   */
  revalidate: number
}

export interface CacheHandler {
  /**
   * Retrieve a cache entry for the given cache key, if available. Will return
   * undefined if there's no valid entry, or if the given soft tags are stale.
   */
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>

  /**
   * Store a cache entry for the given cache key. When this is called, the entry
   * may still be pending, i.e. its value stream may still be written to. So it
   * needs to be awaited first. If a `get` for the same cache key is called,
   * before the pending entry is complete, the cache handler must wait for the
   * `set` operation to finish, before returning the entry, instead of returning
   * undefined.
   */
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>

  /**
   * This function may be called periodically, but always before starting a new
   * request. If applicable, it should communicate with the tags service to
   * refresh the local tags manifest accordingly.
   */
  refreshTags(): Promise<void>

  /**
   * This function is called for each set of soft tags that are relevant at the
   * start of a request. The result is the maximum timestamp of a revalidate
   * event for the tags. Returns `0` if none of the tags were ever revalidated.
   * Returns `Infinity` if the soft tags are supposed to be passed into the
   * `get` method instead to be checked for expiration.
   */
  getExpiration(tags: string[]): Promise<Timestamp>

  /**
   * This function is called when tags are revalidated/expired. If applicable,
   * it should update the tags manifest accordingly.
   */
  updateTags(tags: string[], durations?: { expire?: number }): Promise<void>
}
