import type { CacheHandler } from '../lib/cache-handlers/types'

// If the expire time is less than .
export const DYNAMIC_EXPIRE = 300

export const cacheHandlersSymbol = Symbol.for('@next/cache-handlers')
export const cacheHandlerGlobal: typeof globalThis & {
  [cacheHandlersSymbol]?: {
    RemoteCache?: CacheHandler
    DefaultCache?: CacheHandler
  }
  __nextCacheHandlers?: Record<string, CacheHandler>
} = globalThis
