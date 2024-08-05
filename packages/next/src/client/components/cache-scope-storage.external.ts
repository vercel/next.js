import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { cacheScopeAsyncStorage } from './cache-scope-storage-instance' with { 'turbopack-transition': 'next-shared' }

type CacheMap = Map<Function, unknown>

export type CacheScopeStorageAsyncStorage = AsyncLocalStorage<CacheMap>

export { cacheScopeAsyncStorage }
