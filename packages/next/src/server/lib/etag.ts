/**
 * FNV-1a Hash implementation
 * @author Travis Webb (tjwebb) <me@traviswebb.com>
 *
 * Ported from https://github.com/tjwebb/fnv-plus/blob/master/index.js
 *
 * Simplified, optimized and add modified for 52 bit, which provides a larger hash space
 * and still making use of Javascript's 53-bit integer space.
 */
export const fnv1a52 = (str: string) => {
  const len = str.length
  let i = 0,
    t0 = 0,
    v0 = 0x2325,
    t1 = 0,
    v1 = 0x8422,
    t2 = 0,
    v2 = 0x9ce4,
    t3 = 0,
    v3 = 0xcbf2

  while (i < len) {
    v0 ^= str.charCodeAt(i++)
    t0 = v0 * 435
    t1 = v1 * 435
    t2 = v2 * 435
    t3 = v3 * 435
    t2 += v0 << 8
    t3 += v1 << 8
    t1 += t0 >>> 16
    v0 = t0 & 65535
    t2 += t1 >>> 16
    v1 = t1 & 65535
    v3 = (t3 + (t2 >>> 16)) & 65535
    v2 = t2 & 65535
  }

  return (
    (v3 & 15) * 281474976710656 +
    v2 * 4294967296 +
    v1 * 65536 +
    (v0 ^ (v3 >> 4))
  )
}

/**
 * LRU cache for computed ETags.
 *
 * Pre-rendered pages are served from the incremental cache's in-memory LRU,
 * which hands back the *same* string instance on every request. Hashing it
 * again per request is pure repeated work: `fnv1a52` walks the whole body one
 * `charCodeAt` at a time, which is the dominant cost of serving a static page.
 *
 * The cache is keyed by `payload.length` rather than by the payload itself.
 * That matters: a `Map` keyed by the payload string has to hash the entire
 * string on every lookup, so responses that are *never* repeated (API route
 * JSON, per-request SSR output) would pay a full extra hash and get nothing
 * back. Keying by length makes the lookup a cheap numeric hash, and the stored
 * payload is then compared with `===`, which is a pointer comparison for the
 * repeated-string case and bails at the first differing character otherwise.
 *
 * Two different strings with equal content are still a legitimate hit — equal
 * content means an equal ETag — so the identity check is a fast path, not a
 * correctness requirement.
 *
 * Distinct payloads that happen to share a length collide on one slot and
 * simply evict each other, degrading to the uncached behaviour. Nothing is
 * served incorrectly; the slot just stops paying off.
 */
const MAX_ETAG_CACHE_ENTRIES = 256
/** Skip caching individual payloads above this size. */
const MAX_CACHED_PAYLOAD_LENGTH = 256 * 1024 // 256 KB
/** Ceiling on the total payload bytes the cache may retain. */
const MAX_CACHED_TOTAL_LENGTH = 4 * 1024 * 1024 // 4 MB

type ETagCacheEntry = {
  payload: string
  etag: string
  weak: boolean
}

// `Map` iteration order is insertion order, so it doubles as an LRU: a hit
// re-inserts the entry at the end, and eviction removes the first key.
const etagCache = new Map<number, ETagCacheEntry>()
let etagCacheTotalLength = 0

export const generateETag = (payload: string, weak = false) => {
  const key = payload.length

  const entry = etagCache.get(key)
  if (entry !== undefined && entry.weak === weak && entry.payload === payload) {
    // Move to the end to mark it most-recently-used.
    etagCache.delete(key)
    etagCache.set(key, entry)
    return entry.etag
  }

  const prefix = weak ? 'W/"' : '"'
  const etag =
    prefix + fnv1a52(payload).toString(36) + payload.length.toString(36) + '"'

  if (payload.length <= MAX_CACHED_PAYLOAD_LENGTH) {
    // Replacing the occupant of this slot releases its bytes.
    if (entry !== undefined) {
      etagCacheTotalLength -= entry.payload.length
      etagCache.delete(key)
    }

    etagCache.set(key, { payload, etag, weak })
    etagCacheTotalLength += payload.length

    // Evict oldest-first until both the entry count and the retained byte
    // total are back within bounds.
    while (
      etagCache.size > MAX_ETAG_CACHE_ENTRIES ||
      etagCacheTotalLength > MAX_CACHED_TOTAL_LENGTH
    ) {
      const oldestKey = etagCache.keys().next().value
      if (oldestKey === undefined) break
      const oldest = etagCache.get(oldestKey)!
      // Never evict the entry we just inserted, or the loop cannot converge.
      if (oldestKey === key) break
      etagCacheTotalLength -= oldest.payload.length
      etagCache.delete(oldestKey)
    }
  }

  return etag
}
