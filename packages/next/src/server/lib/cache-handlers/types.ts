/**
 * A timestamp in milliseconds elapsed since the epoch
 */
export type Timestamp = number

export interface CacheEntry {
  /**
   * The serialized value of the entry. A cache handler consumes this stream in
   * `set` and persists what it delivers. A handler can buffer the stream, or it
   * can pipe it to its storage as chunks arrive. Two rules apply either way:
   *
   * - A handler must return a new stream from every `get`.
   * - A handler must not retain the stream after `set` resolves.
   *
   * A stream can be read one time only. A second reader of the same stream gets
   * no data, or an error while the first reader holds the lock. A retained
   * stream also keeps a reference to the async context of the request that
   * created it, which keeps the state of that request reachable for as long as
   * the entry lives.
   *
   * The same applies to the `pendingEntry` promise that `set` receives. A
   * handler must not put that promise in a map that outlives the request.
   *
   * The stream can error and deliver partial data. Each handler decides whether
   * it keeps the partial entry or discards it.
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
   *
   * This is the hard limit. Next.js compares it against `timestamp` on every
   * read and treats a too-old entry as a miss, so a handler does not need to
   * check the age of an entry before it returns one. The dev server raises the
   * limit to five minutes when `expire` is shorter, to keep reloads fast.
   */
  expire: number

  /**
   * How long until the entry should be revalidated [duration in seconds]
   *
   * An entry that is past `revalidate` but within `expire` is still served, and
   * Next.js generates a fresh one in the background. A negative value always
   * lies in the past, so it forces that background refresh on the next read.
   * The built-in handler returns `-1` for an entry whose tag is stale, which
   * serves the entry one more time and replaces it.
   */
  revalidate: number
}

export interface CacheHandler {
  /**
   * Retrieve a cache entry for the given cache key, if available. Will return
   * undefined if there's nothing stored, or if the given soft tags are stale.
   *
   * Each call returns a new `value` stream over the stored bytes. See
   * `CacheEntry.value`.
   */
  get(cacheKey: string, softTags: string[]): Promise<undefined | CacheEntry>

  /**
   * Store a cache entry for the given cache key. When this is called, the entry
   * may still be pending, i.e. its value stream may still be written to. So it
   * needs to be awaited first. If a `get` for the same cache key is called,
   * before the pending entry is complete, the cache handler must wait for the
   * `set` operation to finish, before returning the entry, instead of returning
   * undefined.
   *
   * The handler takes ownership of the entry's `value` stream, and consumes it
   * exactly once. See `CacheEntry.value`.
   *
   * The handler also owns eviction. Next.js never removes an entry from the
   * store, so the store needs a mechanism of its own, such as a time to live
   * from `expire`, or a size-bounded LRU.
   */
  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void>

  /**
   * This function is called once per request, before the first cache read for
   * this handler's kind. A request that reads nothing from this handler does
   * not call it. If applicable, it should communicate with the tags service to
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
