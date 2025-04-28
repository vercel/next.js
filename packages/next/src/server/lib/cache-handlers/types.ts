/**
 * A timestamp in milliseconds elapsed since the epoch
 */
export type Timestamp = number

export interface CacheEntry {
  /**
   * The final cache key. This may differ from the cache key that was determined
   * before the cache entry's value stream was started. During the cache entry
   * generation we might encounter that cookies were read, which then need to be
   * included in the final cache key.
   */
  key: string
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

/**
 * @deprecated Use {@link CacheHandlerV2} instead.
 */
export interface CacheHandler {
  /**
   * Retrieve a cache entry for the given cache key, if available. The softTags
   * should be used to check for staleness.
   */
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>

  /**
   * Store a cache entry for the given cache key. When this is called, the entry
   * may still be pending, i.e. its value stream may still be written to. So it
   * needs to be awaited first. If a `get` for the same cache key is called
   * before the pending entry is complete, the cache handler must wait for the
   * `set` operation to finish, before returning the entry, instead of returning
   * undefined.
   */
  set(cacheKey: string, entry: Promise<CacheEntry>): Promise<void>

  /**
   * Next.js will call this method when `revalidateTag` or `revalidatePath()` is
   * called. It should update the tags manifest accordingly.
   */
  expireTags(...tags: string[]): Promise<void>

  /**
   * The `receiveExpiredTags` method is called when an action request sends the
   * 'x-next-revalidated-tags' header to indicate which tags have been expired
   * by the action. The local tags manifest should be updated accordingly. As
   * opposed to `expireTags`, the tags don't need to be propagated to a tags
   * service, as this was already done by the server action.
   */
  receiveExpiredTags(...tags: string[]): Promise<void>
}

// TODO: Maybe a cache handler should specify whether it is able to handle
// reading cookies, and thus switching up cache keys on the fly, during cache
// entry generation?
export interface CacheHandlerV2 {
  /**
   * Retrieve a cache entry for the given cache key, if available.
   */
  get(cacheKey: string): Promise<undefined | CacheEntry>

  /**
   * Store a cache entry for the given cache key. When this is called, the entry
   * may still be pending, i.e. its value stream may still be written to. So it
   * needs to be awaited first. If a `get` for the same cache key is called
   * before the pending entry is complete, the cache handler must wait for the
   * `set` operation to finish, before returning the entry, instead of returning
   * undefined.
   */
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>

  /**
   * Next.js will call this method periodically, but always before starting a
   * new request. When working with a remote tags service, this method should
   * communicate with the tags service to refresh the local tags manifest
   * accordingly.
   */
  refreshTags(): Promise<void>

  /**
   * Next.js will call this method for each set of soft tags that are relevant
   * at the start of a request. The result is the maximum timestamp of a
   * revalidate event for the tags. Returns `0` if none of the tags were ever
   * revalidated.
   */
  getExpiration(...tags: string[]): Promise<Timestamp>

  /**
   * Next.js will call this method when `revalidateTag` or `revalidatePath()` is
   * called. It should update the tags manifest accordingly.
   */
  expireTags(...tags: string[]): Promise<void>
}

/**
 * This is a compatibility type to ease migration between cache handler
 * versions. Until the old `CacheHandler` type is removed, this type should be
 * used for all internal Next.js functions that deal with cache handlers to
 * ensure that we are compatible with both cache handler versions. An exception
 * is the built-in default cache handler, which implements the
 * {@link CacheHandlerV2} interface.
 */
export type CacheHandlerCompat = CacheHandler | CacheHandlerV2
