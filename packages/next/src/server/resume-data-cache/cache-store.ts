import {
  arrayBufferToString,
  stringToUint8Array,
} from '../app-render/encryption-utils'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CachedFetchValue } from '../response-cache/types'

/**
 * A generic cache store interface.
 */
interface CacheStore<T, S = T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  entries(): Promise<[string, S][]>
  seal(): void
}

/**
 * A mutable cache store for the fetch cache.
 */
export class FetchCacheStore implements CacheStore<CachedFetchValue> {
  private readonly store: Map<string, CachedFetchValue>

  /**
   * Whether the store is immutable.
   */
  private immutable: boolean = false
  public seal() {
    this.immutable = true
  }

  constructor(entries?: Iterable<[string, CachedFetchValue]>) {
    if (entries) {
      this.immutable = true
      this.store = new Map(entries)
    } else {
      this.store = new Map()
    }
  }

  public set(key: string, value: CachedFetchValue): void {
    if (this.immutable) {
      throw new Error('FetchCacheStore is immutable')
    }
    this.store.set(key, value)
  }

  public get(key: string): CachedFetchValue | undefined {
    return this.store.get(key)
  }

  public async entries(): Promise<[string, CachedFetchValue][]> {
    return Array.from(this.store.entries())
  }
}

interface CacheCacheStoreSerialized {
  value: string
  tags: string[]
  stale: number
  timestamp: number
  expire: number
  revalidate: number
}

/**
 * A mutable cache store for the "use cache" cache.
 */
export class UseCacheCacheStore
  implements CacheStore<Promise<CacheEntry>, CacheCacheStoreSerialized>
{
  private readonly store = new Map<string, Promise<CacheEntry>>()

  /**
   * Whether the store is immutable.
   */
  private immutable: boolean = false
  public seal() {
    this.immutable = true
  }

  constructor(entries?: Iterable<[string, CacheCacheStoreSerialized]>) {
    if (entries) {
      this.immutable = true

      for (const [
        key,
        { value, tags, stale, timestamp, expire, revalidate },
      ] of entries) {
        this.store.set(
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
    }
  }

  public set(key: string, value: Promise<CacheEntry>): void {
    if (this.immutable) {
      throw new Error('CacheCacheStore is immutable')
    }
    this.store.set(key, value)
  }

  public get(key: string): Promise<CacheEntry> | undefined {
    return this.store.get(key)
  }

  public async entries(): Promise<[string, CacheCacheStoreSerialized][]> {
    return Promise.all(
      Array.from(this.store.entries()).map(([key, value]) => {
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
}
