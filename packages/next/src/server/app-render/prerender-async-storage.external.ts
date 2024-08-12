import type { AsyncLocalStorage } from 'async_hooks'

import type { CacheSignal } from './cache-signal'
import type { DynamicTrackingState } from './dynamic-rendering'

// Share the instance module in the next-shared layer
import { prerenderAsyncStorage } from './prerender-async-storage-instance' with { 'turbopack-transition': 'next-shared' }

/**
 * The Prerender store is for tracking information related to prerenders.
 *
 * It can be used for both RSC and SSR prerendering and should be scoped as close
 * to the individual `renderTo...` API call as possible. To keep the type simple
 * we don't distinguish between RSC and SSR prerendering explicitly but instead
 * use conditional object properties to infer which mode we are in. For instance cache tracking
 * only needs to happen during the RSC prerender when we are prospectively prerendering
 * to fill all caches.
 */
export type PrerenderStore = {
  /**
   * This is the AbortController passed to React. It can be used to abort the prerender
   * if we encounter contitions that do not require further rendering
   */
  readonly controller: null | AbortController

  /**
   * when not null this signal is used to track cache reads during prerendering and
   * to await all cache reads completing before aborting the prerender.
   */
  readonly cacheSignal: null | CacheSignal

  /**
   * During some prerenders we want to track dynamic access.
   */
  readonly dynamicTracking: null | DynamicTrackingState
}

export type PrerenderAsyncStorage = AsyncLocalStorage<PrerenderStore>
export { prerenderAsyncStorage }
