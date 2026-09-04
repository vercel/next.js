import { InvariantError } from '../../shared/lib/invariant-error'
import {
  type UseCacheCacheStore,
  type FetchCacheStore,
  type EncryptedBoundArgsCacheStore,
  serializeUseCacheCacheStore,
  parseUseCacheCacheStore,
  type DecryptedBoundArgsCacheStore,
  type ImageResponseCacheStore,
  type UseCacheCacheStoreSerialized,
} from './cache-store'

/**
 * An immutable version of the resume data cache used during rendering.
 * This cache is read-only and cannot be modified once created.
 */
export interface RenderResumeDataCache {
  /**
   * Discriminator. `false` means this cache is read-only and cannot be filled
   * with new entries. Used by `ResumeDataCache` consumers to narrow the union
   * via standard discriminated-union narrowing (e.g. `if
   * (resumeDataCache.mutable)`).
   */
  readonly mutable: false

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

  /**
   * A read-only in-memory Map store for rendered `ImageResponse` array buffers.
   * This is only intended for in-memory usage during pre-rendering, and must
   * not be persisted in the resume store. The 'set' operation is omitted to
   * enforce immutability.
   */
  readonly imageResponses: Omit<ImageResponseCacheStore, 'set'>

  /**
   * Serialized cache keys that were intentionally skipped during the
   * prospective prerender (e.g. because the cached function accessed fallback
   * params or other dynamic data). During the final prerender, a key in this
   * set is returned as a hanging promise early, without attempting to look up
   * or generate a cache entry. Optional because this field is intentionally not
   * serialized and won't be present in deserialized caches.
   */
  readonly dynamicCacheKeys?: ReadonlySet<string>
}

/**
 * A mutable version of the resume data cache used during pre-rendering.
 * This cache allows both reading and writing of cached values.
 */
export interface PrerenderResumeDataCache {
  /**
   * Discriminator. `true` means this cache is mutable and can be filled with
   * new entries during this prerender. Used by `ResumeDataCache` consumers to
   * narrow the union via standard discriminated-union narrowing (e.g.
   * `if (resumeDataCache.mutable)`).
   */
  readonly mutable: true

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

  /**
   * A mutable in-memory Map store for rendered `ImageResponse` array buffers.
   * Filled during the prospective prerender and read during the final
   * prerender. Never persisted in the resume store.
   */
  readonly imageResponses: ImageResponseCacheStore

  /**
   * Tracks serialized cache keys that were intentionally skipped during the
   * prospective prerender (e.g. because the cached function accessed fallback
   * params or other dynamic data). During the final prerender, a key in this
   * set is returned as a hanging promise early, without attempting to look up
   * or generate a cache entry.
   *
   * This is intentionally not serialized. It is only used in-memory within a
   * single prerender cycle (prospective to final). During the resume at request
   * time, a cache miss for a dynamic key should generate a fresh entry rather
   * than being short-circuited.
   */
  readonly dynamicCacheKeys: Set<string>
}

/**
 * Discriminated union of the two resume data cache flavors. Consumers should
 * narrow via `resumeDataCache.mutable` to access the mutable Map API (only
 * available on `PrerenderResumeDataCache`).
 */
export type ResumeDataCache = RenderResumeDataCache | PrerenderResumeDataCache

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
  resumeDataCache: ResumeDataCache,
  isCacheComponentsEnabled: boolean
): Promise<string> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`stringifyResumeDataCache` should not be called in edge runtime.'
    )
  }

  if (resumeDataCache.fetch.size === 0 && resumeDataCache.cache.size === 0) {
    return 'null'
  }

  const json: ResumeStoreSerialized = {
    store: {
      fetch: Object.fromEntries(resumeDataCache.fetch),
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
        resumeDataCache.encryptedBoundArgs
      ),
    },
  }

  return JSON.stringify(json)
}

/**
 * Creates a new empty mutable resume data cache for pre-rendering.
 * Initializes fresh Map instances for both the 'use cache' and fetch caches.
 * Used at the start of pre-rendering to begin collecting cached values.
 *
 * @returns A new empty PrerenderResumeDataCache instance
 */
export function createPrerenderResumeDataCache(
  source?: ResumeDataCache
): PrerenderResumeDataCache {
  if (source) {
    return {
      mutable: true,
      cache: new Map(source.cache),
      fetch: new Map(source.fetch),
      encryptedBoundArgs: new Map(source.encryptedBoundArgs),
      decryptedBoundArgs: new Map(source.decryptedBoundArgs),
      imageResponses: new Map(source.imageResponses),
      dynamicCacheKeys: source.dynamicCacheKeys
        ? new Set(source.dynamicCacheKeys)
        : new Set(),
    }
  } else {
    return {
      mutable: true,
      cache: new Map(),
      fetch: new Map(),
      encryptedBoundArgs: new Map(),
      decryptedBoundArgs: new Map(),
      imageResponses: new Map(),
      dynamicCacheKeys: new Set(),
    }
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
  resumeDataCache: ResumeDataCache
): RenderResumeDataCache
export function createRenderResumeDataCache(
  persistedCache: string
): RenderResumeDataCache
export function createRenderResumeDataCache(
  resumeDataCacheOrPersistedCache: ResumeDataCache | string
): RenderResumeDataCache {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      '`createRenderResumeDataCache` should not be called in edge runtime.'
    )
  }

  if (typeof resumeDataCacheOrPersistedCache !== 'string') {
    // If the cache is already read-only, return it directly. Otherwise we
    // perform a type change by overriding the discriminator — the underlying
    // Map references are still shared, but callers should treat the result
    // as immutable.
    if (!resumeDataCacheOrPersistedCache.mutable) {
      return resumeDataCacheOrPersistedCache
    }
    return { ...resumeDataCacheOrPersistedCache, mutable: false }
  }

  if (resumeDataCacheOrPersistedCache === 'null') {
    return {
      mutable: false,
      cache: new Map(),
      fetch: new Map(),
      encryptedBoundArgs: new Map(),
      decryptedBoundArgs: new Map(),
      imageResponses: new Map(),
    }
  }

  const json = JSON.parse(
    resumeDataCacheOrPersistedCache
  ) as ResumeStoreSerialized

  return {
    mutable: false,
    cache: parseUseCacheCacheStore(Object.entries(json.store.cache)),
    fetch: new Map(Object.entries(json.store.fetch)),
    encryptedBoundArgs: new Map(Object.entries(json.store.encryptedBoundArgs)),
    decryptedBoundArgs: new Map(),
    imageResponses: new Map(),
  }
}
