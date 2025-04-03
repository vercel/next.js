import DefaultCacheHandler from '../lib/cache-handlers/default'
import type {
  CacheEntry,
  CacheHandler,
  CacheHandlerCompat,
  CacheHandlerV2,
  Timestamp,
} from '../lib/cache-handlers/types'

const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? (message: string, ...args: any[]) => {
      console.log(`use-cache: ${message}`, ...args)
    }
  : () => {}

/**
 * A cache handler that's scoped to a work unit. It memoizes the results of
 * `refreshTags`, and `getExpiration` for the given implicit tags (via
 * `getImplicitTagsExpiration`).
 */
export class ScopedCacheHandler implements CacheHandlerV2 {
  private implicitTagsExpirationPromise: Promise<Timestamp> | undefined
  private refreshTagsPromise: Promise<void> | undefined

  constructor(
    private readonly underlyingCacheHandler: CacheHandlerV2,
    private readonly implicitTags: string[]
  ) {}

  get(cacheKey: string): Promise<undefined | CacheEntry> {
    return this.underlyingCacheHandler.get(cacheKey)
  }

  set(cacheKey: string, pendingEntry: Promise<CacheEntry>): Promise<void> {
    return this.underlyingCacheHandler.set(cacheKey, pendingEntry)
  }

  refreshTags(): Promise<void> {
    this.refreshTagsPromise ??= this.underlyingCacheHandler.refreshTags()

    return this.refreshTagsPromise
  }

  getExpiration(...tags: string[]): Promise<Timestamp> {
    return this.underlyingCacheHandler.getExpiration(...tags)
  }

  getImplicitTagsExpiration(): Promise<Timestamp> {
    this.implicitTagsExpirationPromise ??= (async () => {
      if (this.implicitTags.length === 0) {
        return 0
      }

      return this.underlyingCacheHandler.getExpiration(...this.implicitTags)
    })()

    return this.implicitTagsExpirationPromise
  }

  expireTags(...tags: string[]): Promise<void> {
    return this.underlyingCacheHandler.expireTags(...tags)
  }
}

const handlersSymbol = Symbol.for('@next/cache-handlers')
const handlersMapSymbol = Symbol.for('@next/cache-handlers-map')
const handlersSetSymbol = Symbol.for('@next/cache-handlers-set')

/**
 * The reference to the cache handlers. We store the cache handlers on the
 * global object so that we can access the same instance across different
 * boundaries (such as different copies of the same module).
 */
const reference: typeof globalThis & {
  [handlersSymbol]?: {
    RemoteCache?: CacheHandlerCompat
    DefaultCache?: CacheHandlerCompat
  }
  [handlersMapSymbol]?: Map<string, CacheHandlerCompat>
  [handlersSetSymbol]?: Set<CacheHandlerCompat>
} = globalThis

/**
 * Initialize the cache handlers.
 * @returns `true` if the cache handlers were initialized, `false` if they were already initialized.
 */
export function initializeCacheHandlers(): boolean {
  // If the cache handlers have already been initialized, don't do it again.
  if (reference[handlersMapSymbol]) {
    debug('cache handlers already initialized')
    return false
  }

  debug('initializing cache handlers')
  reference[handlersMapSymbol] = new Map<string, CacheHandlerCompat>()

  // Initialize the cache from the symbol contents first.
  if (reference[handlersSymbol]) {
    let fallback: CacheHandlerCompat
    if (reference[handlersSymbol].DefaultCache) {
      debug('setting "default" cache handler from symbol')
      fallback = reference[handlersSymbol].DefaultCache
    } else {
      debug('setting "default" cache handler from default')
      fallback = DefaultCacheHandler
    }

    reference[handlersMapSymbol].set('default', fallback)

    if (reference[handlersSymbol].RemoteCache) {
      debug('setting "remote" cache handler from symbol')
      reference[handlersMapSymbol].set(
        'remote',
        reference[handlersSymbol].RemoteCache
      )
    } else {
      debug('setting "remote" cache handler from default')
      reference[handlersMapSymbol].set('remote', fallback)
    }
  } else {
    debug('setting "default" cache handler from default')
    reference[handlersMapSymbol].set('default', DefaultCacheHandler)
    debug('setting "remote" cache handler from default')
    reference[handlersMapSymbol].set('remote', DefaultCacheHandler)
  }

  // Create a set of the cache handlers.
  reference[handlersSetSymbol] = new Set(reference[handlersMapSymbol].values())

  return true
}

/**
 * Get a set iterator over the cache handlers.
 * @returns An iterator over the cache handlers, or `undefined` if they are not
 * initialized.
 */
export function getCacheHandlers():
  | SetIterator<CacheHandlerCompat>
  | undefined {
  if (!reference[handlersSetSymbol]) {
    return undefined
  }

  return reference[handlersSetSymbol].values()
}

/**
 * Set a cache handler by kind.
 * @param kind - The kind of cache handler to set.
 * @param cacheHandler - The cache handler to set.
 */
export function setCacheHandler(
  kind: string,
  cacheHandler: CacheHandlerCompat
): void {
  // This should never be called before initializeCacheHandlers.
  if (!reference[handlersMapSymbol] || !reference[handlersSetSymbol]) {
    throw new Error('Cache handlers not initialized')
  }

  debug('setting cache handler for "%s"', kind)
  reference[handlersMapSymbol].set(kind, cacheHandler)
  reference[handlersSetSymbol].add(cacheHandler)
}

/**
 * Creates a map of cache handlers for all configured cache handlers that can be
 * scoped to a work unit. Modern cache handlers are proxied to memoize the
 * results of `refreshTags`, and `getExpiration` for the given implicit tags
 * (via `getImplicitTagsExpiration`). Legacy cache handlers are used as-is.
 */
export function createScopedCacheHandlers(
  implicitTags: string[]
): Map<string, ScopedCacheHandler | CacheHandler> {
  const cacheHandlers = new Map<string, ScopedCacheHandler | CacheHandler>()

  if (reference[handlersMapSymbol]) {
    for (const [kind, cacheHandler] of reference[handlersMapSymbol]) {
      cacheHandlers.set(
        kind,
        'refreshTags' in cacheHandler
          ? new ScopedCacheHandler(cacheHandler, implicitTags)
          : cacheHandler
      )
    }
  }

  return cacheHandlers
}
