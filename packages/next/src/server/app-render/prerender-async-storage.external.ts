import type { AsyncLocalStorage } from 'async_hooks'

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
   * During some prerenders we want to track dynamic access.
   */
  readonly dynamicTracking: null | DynamicTrackingState
}

export type PrerenderAsyncStorage = AsyncLocalStorage<PrerenderStore>
export { prerenderAsyncStorage }
