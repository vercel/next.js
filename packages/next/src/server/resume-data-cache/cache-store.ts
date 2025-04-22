import {
  arrayBufferToString,
  stringToUint8Array,
} from '../app-render/encryption-utils'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CachedFetchValue } from '../response-cache/types'

/**
 * A generic cache store type that provides a subset of Map functionality
 */
type CacheStore<T> = Pick<
  Map<string, T>,
  'entries' | 'keys' | 'size' | 'get' | 'set'
>

/**
 * A cache store specifically for fetch cache values
 */
export type FetchCacheStore = CacheStore<CachedFetchValue>

/**
 * A cache store for encrypted bound args of inline server functions.
 */
export type EncryptedBoundArgsCacheStore = CacheStore<string>

/**
 * An in-memory-only cache store for decrypted bound args of inline server
 * functions.
 */
export type DecryptedBoundArgsCacheStore = CacheStore<string>

/**
 * Serialized format for "use cache" entries
 */
export interface UseCacheCacheStoreSerialized {
  key: string
  value: string
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

/**
 * A cache store specifically for "use cache" values that stores promises of
 * cache entries.
 */
export class UseCacheCacheStore {
  private cacheEntries: Map<string, Promise<CacheEntry>> = new Map()
  private pendingSets: Set<Promise<void>> = new Set()

  set(key: string, pendingEntry: Promise<CacheEntry>): this {
    this.cacheEntries.set(key, pendingEntry)

    const pendingPromise = pendingEntry
      .then((entry) => {
        // When the cache entry is resolved with a different key, we update the
        // cache entries map accordingly.
        if (entry.key !== key) {
          this.cacheEntries.set(entry.key, Promise.resolve(entry))
          this.cacheEntries.delete(key)
        }
      })
      .catch(() => {})
      .finally(() => {
        this.pendingSets.delete(pendingPromise)
      })

    this.pendingSets.add(pendingPromise)

    return this
  }

  get(key: string): Promise<CacheEntry> | undefined {
    return this.cacheEntries.get(key)
  }

  async entries(): Promise<MapIterator<[string, Promise<CacheEntry>]>> {
    await Promise.all([...this.pendingSets])

    return this.cacheEntries.entries()
  }

  get size(): number {
    return this.cacheEntries.size
  }
}

/**
 * Parses serialized cache entries into a UseCacheCacheStore
 * @param entries - The serialized entries to parse
 * @returns A new UseCacheCacheStore containing the parsed entries
 */
export function parseUseCacheCacheStore(
  values: Iterable<UseCacheCacheStoreSerialized>
): UseCacheCacheStore {
  const store = new UseCacheCacheStore()

  for (const {
    key,
    value,
    tags,
    stale,
    timestamp,
    expire,
    revalidate,
  } of values) {
    store.set(
      key,
      Promise.resolve({
        key,
        // Create a ReadableStream from the Uint8Array
        value: new ReadableStream<Uint8Array>({
          start(controller) {
            // Enqueue the Uint8Array to the stream
            controller.enqueue(stringToUint8Array(atob(value)))

            // Close the stream
            controller.close()
          },
        }),
        tags,
        stale,
        timestamp,
        expire,
        revalidate,
      })
    )
  }

  return store
}

/**
 * Serializes UseCacheCacheStore entries into an array of key-value pairs
 * @param entries - The store entries to stringify
 * @returns A promise that resolves to an array of key-value pairs with serialized values
 */
export async function serializeUseCacheCacheStore(
  entries: Promise<IterableIterator<[string, Promise<CacheEntry>]>>
): Promise<Array<[string, UseCacheCacheStoreSerialized] | null>> {
  return Promise.all(
    Array.from(await entries).map(async ([key, value]) => {
      try {
        const entry = await value
        const [left, right] = entry.value.tee()
        entry.value = right

        let binaryString: string = ''

        // We want to encode the value as a string, but we aren't sure if the
        // value is a a stream of UTF-8 bytes or not, so let's just encode it
        // as a string using base64.
        for await (const chunk of left) {
          binaryString += arrayBufferToString(chunk)
        }
        return [
          key,
          {
            key,
            // Encode the value as a base64 string.
            value: btoa(binaryString),
            tags: entry.tags,
            stale: entry.stale,
            timestamp: entry.timestamp,
            expire: entry.expire,
            revalidate: entry.revalidate,
          },
        ] satisfies [string, UseCacheCacheStoreSerialized]
      } catch {
        // Any failed cache writes should be ignored as to not discard the
        // entire cache.
        return null
      }
    })
  )
}
