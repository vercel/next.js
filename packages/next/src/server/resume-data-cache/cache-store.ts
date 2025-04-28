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
  private cacheEntries: Map<string, CacheEntry> = new Map()
  private pendingSets: Map<string, Promise<string>> = new Map()

  async set(
    cacheKey: string,
    pendingEntry: Promise<CacheEntry>
  ): Promise<void> {
    let resolvePendingPromise: (cacheKey: string) => void

    this.pendingSets.set(
      cacheKey,
      new Promise<string>((resolve) => {
        resolvePendingPromise = resolve
      })
    )

    try {
      const entry = await pendingEntry
      this.setSync(entry)
      resolvePendingPromise!(entry.key)
    } catch {
      resolvePendingPromise!(cacheKey)
    } finally {
      this.pendingSets.delete(cacheKey)
    }
  }

  setSync(entry: CacheEntry): void {
    this.cacheEntries.set(entry.key, entry)
  }

  async get(cacheKey: string): Promise<CacheEntry | undefined> {
    const pendingPromise = this.pendingSets.get(cacheKey)

    if (pendingPromise) {
      cacheKey = await pendingPromise
    }

    return this.cacheEntries.get(cacheKey)
  }

  async keys(): Promise<MapIterator<string>> {
    if (this.pendingSets.size > 0) {
      await Promise.all([...this.pendingSets.values()])
    }

    return this.cacheEntries.keys()
  }

  async entries(): Promise<MapIterator<[string, CacheEntry]>> {
    if (this.pendingSets.size > 0) {
      await Promise.all([...this.pendingSets.values()])
    }

    return this.cacheEntries.entries()
  }

  async getSize(): Promise<number> {
    if (this.pendingSets.size > 0) {
      await Promise.all([...this.pendingSets.values()])
    }

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
    store.setSync({
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
  }

  return store
}

/**
 * Serializes UseCacheCacheStore entries into an array of key-value pairs
 * @param entries - The store entries to stringify
 * @returns A promise that resolves to an array of key-value pairs with serialized values
 */
export async function serializeUseCacheCacheStore(
  entries: Promise<IterableIterator<[string, CacheEntry]>>
): Promise<Array<[string, UseCacheCacheStoreSerialized] | null>> {
  return Promise.all(
    Array.from(await entries).map(async ([key, entry]) => {
      try {
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
