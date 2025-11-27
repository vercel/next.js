import { InvariantError } from '../../shared/lib/invariant-error'
import {
  type UseCacheCacheStore,
  type FetchCacheStore,
  type EncryptedBoundArgsCacheStore,
  serializeUseCacheCacheStore,
  parseUseCacheCacheStore,
  type DecryptedBoundArgsCacheStore,
  type UseCacheCacheStoreSerialized,
} from './cache-store'

/**
 * An immutable version of the resume data cache used during rendering.
 * This cache is read-only and cannot be modified once created.
 */
export interface RenderResumeDataCache {
  /**
   * A read-only Map store for values cached by the 'use cache' React hook.
   * The 'set' operation is omitted to enforce immutability.
   */
  readonly cache: Omit<UseCacheCacheStore, 'set'>

  /**
   * A read-only Map store for cached fetch responses.
   * The 'set' operation is omitted to enforce immutability.
   */
  readonly fetch: Omit<FetchCacheStore, 'set'>

  /**
   * A read-only Map store for encrypted bound args of inline server functions.
   * The 'set' operation is omitted to enforce immutability.
   */
  readonly encryptedBoundArgs: Omit<EncryptedBoundArgsCacheStore, 'set'>

  /**
   * A read-only Map store for decrypted bound args of inline server functions.
   * This is only intended for in-memory usage during pre-rendering, and must
   * not be persisted in the resume store. The 'set' operation is omitted to
   * enforce immutability.
   */
  readonly decryptedBoundArgs: Omit<DecryptedBoundArgsCacheStore, 'set'>
}

/**
 * A mutable version of the resume data cache used during pre-rendering.
 * This cache allows both reading and writing of cached values.
 */
export interface PrerenderResumeDataCache {
  /**
   * A mutable Map store for values cached by the 'use cache' React hook.
   * Supports both 'get' and 'set' operations to build the cache during
   * pre-rendering.
   */
  readonly cache: UseCacheCacheStore

  /**
   * A mutable Map store for cached fetch responses.
   * Supports both 'get' and 'set' operations to build the cache during
   * pre-rendering.
   */
  readonly fetch: FetchCacheStore

  /**
   * A mutable Map store for encrypted bound args of inline server functions.
   * Supports both 'get' and 'set' operations to build the cache during
   * pre-rendering.
   */
  readonly encryptedBoundArgs: EncryptedBoundArgsCacheStore

  /**
   * A mutable Map store for decrypted bound args of inline server functions.
   * This is only intended for in-memory usage during pre-rendering, and must
   * not be persisted in the resume store. Supports both 'get' and 'set'
   * operations to build the cache during pre-rendering.
   */
  readonly decryptedBoundArgs: DecryptedBoundArgsCacheStore
}

type ResumeStoreSerialized = {
  store: {
    cache: {
      [key: string]: any
    }
    fetch: {
      [key: string]: any
    }
    encryptedBoundArgs: {
      [key: string]: string
    }
  }
}

/**
 * Serializes a resume data cache into a JSON string for storage or
 * transmission. Handles 'use cache' values, fetch responses, and encrypted
 * bound args for inline server functions.
 *
 * @param resumeDataCache - The immutable cache to serialize
 * @returns A Promise that resolves to the serialized cache as a JSON string, or
 * 'null' if empty
 */
export async function stringifyResumeDataCache(
  resumeDataCache: RenderResumeDataCache | PrerenderResumeDataCache,
  isCacheComponentsEnabled: boolean
): Promise<string> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`stringifyResumeDataCache` should not be called in edge runtime.'
    )
  } else {
    if (resumeDataCache.fetch.size === 0 && resumeDataCache.cache.size === 0) {
      return 'null'
    }

    const json: ResumeStoreSerialized = {
      store: {
        fetch: Object.fromEntries(Array.from(resumeDataCache.fetch.entries())),
        cache: Object.fromEntries(
          (
            await serializeUseCacheCacheStore(
              resumeDataCache.cache.entries(),
              isCacheComponentsEnabled
            )
          ).filter(
            (entry): entry is [string, UseCacheCacheStoreSerialized] =>
              entry !== null
          )
        ),
        encryptedBoundArgs: Object.fromEntries(
          Array.from(resumeDataCache.encryptedBoundArgs.entries())
        ),
      },
    }

    // Compress the JSON string using zlib. As the data we already want to
    // decompress is in memory, we use the synchronous deflateSync function.
    const { deflateSync } = require('node:zlib') as typeof import('node:zlib')

    return deflateSync(JSON.stringify(json)).toString('base64')
  }
}

/**
 * Creates a new empty mutable resume data cache for pre-rendering.
 * Initializes fresh Map instances for both the 'use cache' and fetch caches.
 * Used at the start of pre-rendering to begin collecting cached values.
 *
 * @returns A new empty PrerenderResumeDataCache instance
 */
export function createPrerenderResumeDataCache(): PrerenderResumeDataCache {
  return {
    cache: new Map(),
    fetch: new Map(),
    encryptedBoundArgs: new Map(),
    decryptedBoundArgs: new Map(),
  }
}

/**
 * Creates an immutable render resume data cache from either:
 * 1. An existing prerender cache instance
 * 2. A serialized cache string
 *
 * @param renderResumeDataCache - A RenderResumeDataCache instance to be used directly
 * @param prerenderResumeDataCache - A PrerenderResumeDataCache instance to convert to immutable
 * @param persistedCache - A serialized cache string to parse
 * @returns An immutable RenderResumeDataCache instance
 */
export function createRenderResumeDataCache(
  renderResumeDataCache: RenderResumeDataCache
): RenderResumeDataCache
export function createRenderResumeDataCache(
  prerenderResumeDataCache: PrerenderResumeDataCache
): RenderResumeDataCache
export function createRenderResumeDataCache(
  persistedCache: string
): RenderResumeDataCache
export function createRenderResumeDataCache(
  resumeDataCacheOrPersistedCache:
    | RenderResumeDataCache
    | PrerenderResumeDataCache
    | string
): RenderResumeDataCache {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`createRenderResumeDataCache` should not be called in edge runtime.'
    )
  } else {
    if (typeof resumeDataCacheOrPersistedCache !== 'string') {
      // If the cache is already a prerender or render cache, we can return it
      // directly. For the former, we're just performing a type change.
      return resumeDataCacheOrPersistedCache
    }

    if (resumeDataCacheOrPersistedCache === 'null') {
      return {
        cache: new Map(),
        fetch: new Map(),
        encryptedBoundArgs: new Map(),
        decryptedBoundArgs: new Map(),
      }
    }

    // This should be a compressed string. Let's decompress it using zlib.
    // As the data we already want to decompress is in memory, we use the
    // synchronous inflateSync function.
    const { inflateSync } = require('node:zlib') as typeof import('node:zlib')

    const json: ResumeStoreSerialized = JSON.parse(
      inflateSync(
        Buffer.from(resumeDataCacheOrPersistedCache, 'base64')
      ).toString('utf-8')
    )

    return {
      cache: parseUseCacheCacheStore(Object.entries(json.store.cache)),
      fetch: new Map(Object.entries(json.store.fetch)),
      encryptedBoundArgs: new Map(
        Object.entries(json.store.encryptedBoundArgs)
      ),
      decryptedBoundArgs: new Map(),
    }
  }
}
