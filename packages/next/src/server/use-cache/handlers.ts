import { createDefaultCacheHandler } from '../lib/cache-handlers/default'
import type { CacheHandler } from '../lib/cache-handlers/types'

const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? (message: string, ...args: any[]) => {
      console.log(`use-cache: ${message}`, ...args)
    }
  : undefined

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
    RemoteCache?: CacheHandler
    DefaultCache?: CacheHandler
  }
  [handlersMapSymbol]?: Map<string, CacheHandler>
  [handlersSetSymbol]?: Set<CacheHandler>
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
  reference[handlersMapSymbol] = new Map<string, CacheHandler>()

  // Initialize the cache from the symbol contents first.
  if (reference[handlersSymbol]) {
    let fallback: CacheHandler
    if (reference[handlersSymbol].DefaultCache) {
      debug?.('setting "default" cache handler from symbol')
      fallback = reference[handlersSymbol].DefaultCache
    } else {
      debug?.('setting "default" cache handler from default')
      fallback = createDefaultCacheHandler(cacheMaxMemorySize)
    }

    reference[handlersMapSymbol].set('default', fallback)

    if (reference[handlersSymbol].RemoteCache) {
      debug?.('setting "remote" cache handler from symbol')
      reference[handlersMapSymbol].set(
        'remote',
        reference[handlersSymbol].RemoteCache
      )
    } else {
      debug?.('setting "remote" cache handler from default')
      reference[handlersMapSymbol].set('remote', fallback)
    }
  } else {
    const handler = createDefaultCacheHandler(cacheMaxMemorySize)

    debug?.('setting "default" cache handler from default')
    reference[handlersMapSymbol].set('default', handler)
    debug?.('setting "remote" cache handler from default')
    reference[handlersMapSymbol].set('remote', handler)
  }

  // Create a set of the cache handlers.
  reference[handlersSetSymbol] = new Set(reference[handlersMapSymbol].values())

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
 * Get a set iterator over the cache handlers.
 * @returns An iterator over the cache handlers, or `undefined` if they are not
 * initialized.
 */
export function getCacheHandlers(): SetIterator<CacheHandler> | undefined {
  if (!reference[handlersSetSymbol]) {
    return undefined
  }

  return reference[handlersSetSymbol].values()
}

/**
 * Get a map iterator over the cache handlers (keyed by kind).
 * @returns An iterator over the cache handler entries, or `undefined` if they
 * are not initialized.
 * @throws If the cache handlers are not initialized.
 */
export function getCacheHandlerEntries():
  | MapIterator<[string, CacheHandler]>
  | undefined {
  if (!reference[handlersMapSymbol]) {
    return undefined
  }

  return reference[handlersMapSymbol].entries()
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
}
