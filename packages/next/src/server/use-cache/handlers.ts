import { createDefaultCacheHandler } from '../lib/cache-handlers/default'
import type { CacheHandler } from '../lib/cache-handlers/types'
import {
  createTieredCacheHandler,
  type CacheReadWriteHandler,
} from './tiered-cache-handler'

const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? (message: string, ...args: any[]) => {
      console.log(`use-cache: ${message}`, ...args)
    }
  : undefined

const handlersSymbol = Symbol.for('@next/cache-handlers')
const handlersMapSymbol = Symbol.for('@next/cache-handlers-map')
const handlersSetSymbol = Symbol.for('@next/cache-handlers-set')
const privateHandlerSymbol = Symbol.for('@next/cache-handlers-private')
const devFrontHandlersSymbol = Symbol.for('@next/cache-handlers-dev-fronts')
const devTieredHandlersSymbol = Symbol.for('@next/cache-handlers-dev-tiered')
const memoryCacheDisabledSymbol = Symbol.for(
  '@next/cache-handlers-memory-disabled'
)

/**
 * The in-memory size used for the dev-only built-in handlers (the private
 * handler, the size-0 replacement, and the per-kind front handlers for custom
 * kinds). Mirrors the framework default so `cacheMaxMemorySize: 0` does not
 * disable caching in development.
 */
const DEV_MEMORY_CACHE_SIZE = 50 * 1024 * 1024

/**
 * The reference to the cache handlers. We store the cache handlers on the
 * global object so that we can access the same instance across different
 * boundaries (such as different copies of the same module).
 */
const reference: typeof globalThis & {
  [handlersSymbol]?: {
    RemoteCache?: CacheHandler
    DefaultCache?: CacheHandler
  }
  [handlersMapSymbol]?: Map<string, CacheHandler>
  [handlersSetSymbol]?: Set<CacheHandler>
  // DEV-only
  [privateHandlerSymbol]?: CacheHandler
  [devFrontHandlersSymbol]?: Map<string, CacheHandler>
  [devTieredHandlersSymbol]?: Map<string, CacheReadWriteHandler>
  [memoryCacheDisabledSymbol]?: boolean
} = globalThis

/**
 * Initialize the cache handlers.
 * @param cacheMaxMemorySize - The maximum memory size of the cache in bytes, if
 *  not provided, the default memory size will be used.
 * @returns `true` if the cache handlers were initialized, `false` if they were already initialized.
 */
export function initializeCacheHandlers(cacheMaxMemorySize: number): boolean {
  // If the cache handlers have already been initialized, don't do it again.
  if (reference[handlersMapSymbol]) {
    debug?.('cache handlers already initialized')
    return false
  }

  debug?.('initializing cache handlers')
  const handlersMap = new Map<string, CacheHandler>()
  reference[handlersMapSymbol] = handlersMap

  // In development, `cacheMaxMemorySize: 0` would make the built-in default
  // handler a no-op, so every reload would miss. Use a real in-memory size
  // instead so dev stays fast; the "use cache" wrapper forces a dynamic cache
  // life for this case so it still behaves close to "no cache" (serve stale,
  // regenerate in the background). Production keeps the no-op handler.
  const builtInSize =
    process.env.__NEXT_DEV_SERVER && cacheMaxMemorySize === 0
      ? DEV_MEMORY_CACHE_SIZE
      : cacheMaxMemorySize

  // Initialize the cache from the symbol contents first.
  if (reference[handlersSymbol]) {
    let fallback: CacheHandler
    if (reference[handlersSymbol].DefaultCache) {
      debug?.('setting "default" cache handler from symbol')
      fallback = reference[handlersSymbol].DefaultCache
    } else {
      debug?.('setting "default" cache handler from default')
      fallback = createDefaultCacheHandler(builtInSize)
    }

    handlersMap.set('default', fallback)

    if (reference[handlersSymbol].RemoteCache) {
      debug?.('setting "remote" cache handler from symbol')
      handlersMap.set('remote', reference[handlersSymbol].RemoteCache)
    } else {
      debug?.('setting "remote" cache handler from default')
      handlersMap.set('remote', fallback)
    }
  } else {
    const handler = createDefaultCacheHandler(builtInSize)

    debug?.('setting "default" cache handler from default')
    handlersMap.set('default', handler)
    debug?.('setting "remote" cache handler from default')
    handlersMap.set('remote', handler)
  }

  // Create a set of the cache handlers.
  reference[handlersSetSymbol] = new Set(handlersMap.values())

  // In development we add dedicated built-in in-memory handlers so that warm
  // reloads are fast. These are always built-in handlers, never a
  // user-configured one, and are gated on the dev server so production behaves
  // exactly as configured.
  if (process.env.__NEXT_DEV_SERVER) {
    reference[memoryCacheDisabledSymbol] = cacheMaxMemorySize === 0

    // Private caches are persisted here so warm reloads are fast. Private
    // entries can hold data specific to the incoming request (for example,
    // derived from its cookies or headers), so this is never the
    // user-configured `default` alias. Sized so it still caches under
    // `cacheMaxMemorySize: 0` (otherwise it would become the no-op stub and
    // private reloads would miss).
    reference[privateHandlerSymbol] = createDefaultCacheHandler(
      DEV_MEMORY_CACHE_SIZE
    )

    // Built-in front handlers, one per custom kind, and the tiered handlers
    // that place a front in front of a (possibly slow or remote) backing
    // handler so warm reads resolve in a microtask, are both created per kind
    // in `setCacheHandler`.
    reference[devFrontHandlersSymbol] = new Map()
    reference[devTieredHandlersSymbol] = new Map()
  }

  return true
}

/**
 * Get a cache handler by kind.
 * @param kind - The kind of cache handler to get.
 * @returns The cache handler, or `undefined` if it does not exist.
 * @throws If the cache handlers are not initialized.
 */
export function getCacheHandler(kind: string): CacheHandler | undefined {
  // This should never be called before initializeCacheHandlers.
  if (!reference[handlersMapSymbol]) {
    throw new Error('Cache handlers not initialized')
  }

  return reference[handlersMapSymbol].get(kind)
}

/**
 * Get the dedicated in-memory cache handler that persists private caches in
 * development. Returns `undefined` outside the dev server, where private caches
 * must not be persisted. This is intentionally not part of the kind-keyed
 * handlers map so that it can never be replaced by a user-configured handler.
 */
export function getPrivateCacheHandler(): CacheHandler | undefined {
  // This should never be called before initializeCacheHandlers.
  if (!reference[handlersMapSymbol]) {
    throw new Error('Cache handlers not initialized')
  }

  return reference[privateHandlerSymbol]
}

/**
 * Whether the in-memory cache is disabled (`cacheMaxMemorySize: 0`). Dev-only
 * signal used to force a dynamic cache life so that the size-0 case still
 * serves stale and regenerates in the background. Always `false` in production.
 */
export function isMemoryCacheDisabled(): boolean {
  return reference[memoryCacheDisabledSymbol] ?? false
}

/**
 * Whether `kind` is backed by a real user-configured handler rather than the
 * built-in in-memory default. Such a handler may be slow or remote, so in
 * development a built-in front handler is placed in front of it (see
 * `getDevTieredCacheHandler`) to keep warm reads microtask-fast. The presence
 * of a dev front handler is the signal, since front handlers are created
 * exactly for user-registered kinds. Always `false` in production.
 */
export function isCustomCacheHandler(kind: string): boolean {
  if (!process.env.__NEXT_DEV_SERVER) {
    return false
  }

  return reference[devFrontHandlersSymbol]?.has(kind) ?? false
}

/**
 * Get the dev-only tiered cache handler for a custom `kind`: a fast built-in
 * in-memory front handler in front of the user-configured backing handler, so
 * warm reads resolve in a microtask. Returns `undefined` if there is none (a
 * built-in kind, or production).
 */
export function getDevTieredCacheHandler(
  kind: string
): CacheReadWriteHandler | undefined {
  if (!process.env.__NEXT_DEV_SERVER) {
    return undefined
  }

  return reference[devTieredHandlersSymbol]?.get(kind)
}

/**
 * Get an iterator over the cache handlers.
 * @returns An iterator over the cache handlers, or `undefined` if they are not
 * initialized.
 */
export function getCacheHandlers(): IterableIterator<CacheHandler> | undefined {
  const handlersSet = reference[handlersSetSymbol]
  if (!handlersSet) {
    return undefined
  }

  if (process.env.__NEXT_DEV_SERVER) {
    return iterateCacheHandlersWithDevBuiltIns(handlersSet)
  }

  return handlersSet.values()
}

/**
 * Yields the registered handlers plus the dev-only built-in handlers (the
 * private handler and the per-kind front handlers). The built-in handlers are
 * not part of the registered set, but tag operations must still reach them:
 * their `updateTags` writes the shared tags manifest that their `get` consults,
 * so `revalidateTag` can invalidate their entries.
 */
function* iterateCacheHandlersWithDevBuiltIns(
  handlersSet: Set<CacheHandler>
): IterableIterator<CacheHandler> {
  yield* handlersSet

  const privateHandler = reference[privateHandlerSymbol]
  if (privateHandler) {
    yield privateHandler
  }

  const devFrontHandlers = reference[devFrontHandlersSymbol]
  if (devFrontHandlers) {
    yield* devFrontHandlers.values()
  }
}

/**
 * Get a map iterator over the cache handlers (keyed by kind).
 * @returns An iterator over the cache handler entries, or `undefined` if they
 * are not initialized.
 * @throws If the cache handlers are not initialized.
 */
export function getCacheHandlerEntries():
  | IterableIterator<[string, CacheHandler]>
  | undefined {
  const handlersMap = reference[handlersMapSymbol]
  if (!handlersMap) {
    return undefined
  }

  if (process.env.__NEXT_DEV_SERVER) {
    return iterateCacheHandlerEntriesWithDevBuiltIns(handlersMap)
  }

  return handlersMap.entries()
}

/**
 * Yields the registered entries plus the dev-only private handler under its
 * kind, so that per-kind tag operations (`refreshTags` / `getExpiration` for
 * implicit tags) apply to private entries. Custom-kind front handlers are
 * intentionally omitted: the backing handler (already in the map) is
 * authoritative for that kind's `getExpiration`, and a front entry is discarded
 * via that same value.
 */
function* iterateCacheHandlerEntriesWithDevBuiltIns(
  handlersMap: Map<string, CacheHandler>
): IterableIterator<[string, CacheHandler]> {
  yield* handlersMap.entries()

  const privateHandler = reference[privateHandlerSymbol]
  if (privateHandler) {
    const privateEntry: [string, CacheHandler] = ['private', privateHandler]
    yield privateEntry
  }
}

/**
 * Set a cache handler by kind.
 * @param kind - The kind of cache handler to set.
 * @param cacheHandler - The cache handler to set.
 */
export function setCacheHandler(
  kind: string,
  cacheHandler: CacheHandler
): void {
  // This should never be called before initializeCacheHandlers.
  if (!reference[handlersMapSymbol] || !reference[handlersSetSymbol]) {
    throw new Error('Cache handlers not initialized')
  }

  debug?.('setting cache handler for "%s"', kind)
  reference[handlersMapSymbol].set(kind, cacheHandler)
  reference[handlersSetSymbol].add(cacheHandler)

  // A user-configured handler may be slow or remote. In development, give it a
  // dedicated built-in in-memory front handler so warm reads resolve in a
  // microtask, and pair the two into a tiered handler the wrapper reads
  // through. Both are created alongside registration so their lifecycle matches
  // the backing handler's, and the front handler's presence is the signal that
  // this kind is backed by a real handler (see `isCustomCacheHandler`).
  if (process.env.__NEXT_DEV_SERVER) {
    const frontHandler = createDefaultCacheHandler(DEV_MEMORY_CACHE_SIZE)
    reference[devFrontHandlersSymbol]?.set(kind, frontHandler)
    reference[devTieredHandlersSymbol]?.set(
      kind,
      createTieredCacheHandler(frontHandler, cacheHandler)
    )
  }
}
