import type { AsyncLocalStorage } from 'async_hooks'

// Share the instance module in the next-shared layer
import { cacheAsyncStorage } from './cache-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

/**
 * The Cache store is for tracking information inside a "use cache" or unstable_cache context.
 * Inside this context we should never expose any request or page specific information.
 */
export type CacheStore = {
  // TODO: Inside this scope we'll track tags and life times of this scope.
}

export type CacheAsyncStorage = AsyncLocalStorage<CacheStore>
export { cacheAsyncStorage }
