import {
  arrayBufferToString,
  stringToUint8Array,
} from '../app-render/encryption-utils'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CachedFetchValue } from '../response-cache/types'

type ResumeStoreSerialized = {
  version: 1
  store: {
    cache: {
      [key: string]: any
    }
    fetch: {
      [key: string]: any
    }
  }
}

interface CacheStore<T, S = T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  entries(): Promise<[string, S][]>
  seal(): void
}

class FetchCacheStore implements CacheStore<CachedFetchValue> {
  private readonly store: Map<string, CachedFetchValue>

  /**
   * Whether the store is immutable.
   */
  private immutable: boolean = false

  constructor(entries?: Iterable<[string, CachedFetchValue]>) {
    if (entries) {
      this.immutable = true
      this.store = new Map(entries)
    } else {
      this.store = new Map()
    }
  }

  public seal() {
    this.immutable = true
  }

  public set(key: string, value: CachedFetchValue): void {
    if (this.immutable) return
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

class CacheCacheStore
  implements CacheStore<Promise<CacheEntry>, CacheCacheStoreSerialized>
{
  private readonly store = new Map<string, Promise<CacheEntry>>()
  private immutable: boolean = false

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

  public seal() {
    this.immutable = true
  }

  public set(key: string, value: Promise<CacheEntry>): void {
    if (this.immutable) return
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

interface ImmutableCacheStore<T> {
  get(key: string): T | undefined
}

/**
 * An immutable version of the resume data cache.
 */
export interface ImmutableResumeDataCache {
  cache: ImmutableCacheStore<Promise<CacheEntry>>
  fetch: ImmutableCacheStore<CachedFetchValue>
}

interface MutableCacheStore<T> extends ImmutableCacheStore<T> {
  set(key: string, value: T): void
}

/**
 * A mutable version of the resume data cache.
 */
export interface MutableResumeDataCache {
  cache: MutableCacheStore<Promise<CacheEntry>>
  fetch: MutableCacheStore<CachedFetchValue>
}

/**
 * The resume data cache used when resuming a request from a prerender.
 */
export class ResumeDataCache
  implements ImmutableResumeDataCache, MutableResumeDataCache
{
  constructor(
    public readonly cache: CacheCacheStore = new CacheCacheStore(),
    public readonly fetch: FetchCacheStore = new FetchCacheStore()
  ) {}

  public static async parse(text: string): Promise<ResumeDataCache> {
    const json: ResumeStoreSerialized = JSON.parse(text)
    if (json.version !== 1) {
      throw new Error(`Unsupported version: ${json.version}`)
    }

    return new ResumeDataCache(
      new CacheCacheStore(Object.entries(json.store.cache)),
      new FetchCacheStore(Object.entries(json.store.fetch))
    )
  }

  /**
   * Seal the cache and fetch stores and make them immutable.
   */
  public seal() {
    // Seal all the stores.
    this.cache.seal()
    this.fetch.seal()
  }

  public async stringify(): Promise<string> {
    const json: ResumeStoreSerialized = {
      version: 1,
      store: {
        fetch: Object.fromEntries(await this.fetch.entries()),
        cache: Object.fromEntries(await this.cache.entries()),
      },
    }

    return JSON.stringify(json, null, 2)
  }
}
