import {
  arrayBufferToString,
  stringToUint8Array,
} from '../app-render/encryption-utils'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CachedFetchValue } from '../response-cache/types'

/**
 * A generic cache store type that provides a subset of Map functionality
 */
type CacheStore<T> = Pick<Map<string, T>, 'entries' | 'size' | 'get' | 'set'>

/**
 * A cache store specifically for fetch cache values
 */
export type FetchCacheStore = CacheStore<CachedFetchValue>

/**
 * Parses fetch cache entries into a FetchCacheStore
 * @param entries - The entries to parse into the store
 * @returns A new FetchCacheStore containing the entries
 */
export function parseFetchCacheStore(
  entries: Iterable<[string, CachedFetchValue]>
): FetchCacheStore {
  return new Map(entries)
}

/**
 * Stringifies a FetchCacheStore into an array of key-value pairs
 * @param store - The store to stringify
 * @returns A promise that resolves to an array of key-value pairs
 */
export function stringifyFetchCacheStore(
  entries: IterableIterator<[string, CachedFetchValue]>
): [string, CachedFetchValue][] {
  return Array.from(entries)
}

/**
 * Serialized format for cache entries
 */
interface CacheCacheStoreSerialized {
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
export type UseCacheCacheStore = Pick<
  Map<string, Promise<CacheEntry>>,
  'entries' | 'size' | 'get' | 'set'
>

/**
 * Parses serialized cache entries into a UseCacheCacheStore
 * @param entries - The serialized entries to parse
 * @returns A new UseCacheCacheStore containing the parsed entries
 */
export function parseUseCacheCacheStore(
  entries: Iterable<[string, CacheCacheStoreSerialized]>
): UseCacheCacheStore {
  const store = new Map<string, Promise<CacheEntry>>()

  for (const [
    key,
    { value, tags, stale, timestamp, expire, revalidate },
  ] of entries) {
    store.set(
      key,
      Promise.resolve({
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
 * Stringifies a UseCacheCacheStore into an array of key-value pairs
 * @param store - The store to stringify
 * @returns A promise that resolves to an array of key-value pairs with serialized values
 */
export async function stringifyUseCacheCacheStore(
  entries: IterableIterator<[string, Promise<CacheEntry>]>
): Promise<[string, CacheCacheStoreSerialized][]> {
  return Promise.all(
    Array.from(entries).map(([key, value]) => {
      return value.then(async (entry) => {
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
            // Encode the value as a base64 string.
            value: btoa(binaryString),
            tags: entry.tags,
            stale: entry.stale,
            timestamp: entry.timestamp,
            expire: entry.expire,
            revalidate: entry.revalidate,
          },
        ] as [string, CacheCacheStoreSerialized]
      })
    })
  )
}
