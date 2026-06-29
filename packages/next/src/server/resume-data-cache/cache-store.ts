import {
  arrayBufferToString,
  stringToUint8Array,
} from '../app-render/encryption-utils'
import type { CachedFetchValue } from '../response-cache/types'
import { DYNAMIC_EXPIRE } from '../use-cache/constants'
import type { CollectedCacheResult } from '../use-cache/use-cache-wrapper'

/**
 * A generic cache store type that provides a subset of Map functionality
 */
type CacheStore<T> = Pick<
  Map<string, T>,
  'entries' | 'keys' | 'size' | 'get' | 'set' | 'has' | typeof Symbol.iterator
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
 * An in-memory-only cache store for rendered `ImageResponse` array buffers,
 * keyed by a serialization of the `ImageResponse` constructor args. This lets
 * the prospective prerender render the image once and hand the array buffer to
 * the final prerender within microtasks, so that metadata image routes can be
 * statically prerendered under Cache Components. Never serialized into the
 * resume store.
 */
export type ImageResponseCacheStore = CacheStore<Promise<ArrayBuffer>>

/**
 * Serialized format for "use cache" entries
 */
export interface UseCacheCacheStoreSerialized {
  entry: {
    value: string
    tags: string[]
    stale: number
    timestamp: number
    expire: number
    revalidate: number
  }
  hasExplicitRevalidate: boolean | undefined
  hasExplicitExpire: boolean | undefined
  readRootParamNames: string[] | undefined
}

/**
 * A cache store specifically for "use cache" values that stores promises of
 * collected cache results (entry + metadata).
 */
export type UseCacheCacheStore = CacheStore<Promise<CollectedCacheResult>>

/**
 * Parses serialized cache entries into a UseCacheCacheStore
 * @param entries - The serialized entries to parse
 * @returns A new UseCacheCacheStore containing the parsed entries
 */
export function parseUseCacheCacheStore(
  entries: Iterable<[string, UseCacheCacheStoreSerialized]>
): UseCacheCacheStore {
  const store = new Map<string, Promise<CollectedCacheResult>>()

  for (const [
    key,
    { entry, hasExplicitRevalidate, hasExplicitExpire, readRootParamNames },
  ] of entries) {
    store.set(
      key,
      Promise.resolve({
        entry: {
          // Create a ReadableStream from the Uint8Array
          value: new ReadableStream<Uint8Array>({
            start(controller) {
              // Enqueue the Uint8Array to the stream
              controller.enqueue(stringToUint8Array(atob(entry.value)))

              // Close the stream
              controller.close()
            },
          }),
          tags: entry.tags,
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        },
        hasExplicitRevalidate,
        hasExplicitExpire,
        readRootParamNames: readRootParamNames
          ? new Set(readRootParamNames)
          : undefined,
        // Serialized RDC entries are non-dynamic by construction (the
        // serializer drops dynamic entries), so this is never produced from the
        // wire — the throw path that consumes it is only reachable for dynamic
        // entries, which only exist in the in-memory RDC.
        dynamicNestedCacheError: undefined,
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
  entries: IterableIterator<[string, Promise<CollectedCacheResult>]>,
  isCacheComponentsEnabled: boolean
): Promise<Array<[string, UseCacheCacheStoreSerialized] | null>> {
  return Promise.all(
    Array.from(entries).map(([key, value]) => {
      return value
        .then(
          async ({
            entry,
            hasExplicitRevalidate,
            hasExplicitExpire,
            readRootParamNames,
          }) => {
            if (
              isCacheComponentsEnabled &&
              (entry.revalidate === 0 || entry.expire < DYNAMIC_EXPIRE)
            ) {
              // The entry was omitted from the prerender result, and subsequently
              // does not need to be included in the serialized RDC.
              return null
            }

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
                entry: {
                  // Encode the value as a base64 string.
                  value: btoa(binaryString),
                  tags: entry.tags,
                  stale: entry.stale,
                  timestamp: entry.timestamp,
                  expire: entry.expire,
                  revalidate: entry.revalidate,
                },
                hasExplicitRevalidate,
                hasExplicitExpire,
                readRootParamNames: readRootParamNames
                  ? [...readRootParamNames]
                  : undefined,
              },
            ] satisfies [string, UseCacheCacheStoreSerialized]
          }
        )
        .catch(() => {
          // Any failed cache writes should be ignored as to not discard the
          // entire cache.
          return null
        })
    })
  )
}
