import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../async-storage/draft-mode-provider'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { CacheSignal } from './cache-signal'
import type { DynamicTrackingState } from './dynamic-rendering'

// Share the instance module in the next-shared layer
import { workUnitAsyncStorage } from './work-unit-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { ServerComponentsHmrCache } from '../response-cache'

type WorkUnitPhase = 'action' | 'render' | 'after'

type PhasePartial = {
  /** NOTE: Will be mutated as phases change */
  phase: WorkUnitPhase
}

export type RequestStore = {
  type: 'request'

  /**
   * The URL of the request. This only specifies the pathname and the search
   * part of the URL.
   */
  readonly url: {
    /**
     * The pathname of the requested URL.
     */
    readonly pathname: string

    /**
     * The search part of the requested URL. If the request did not provide a
     * search part, this will be an empty string.
     */
    readonly search: string
  }

  readonly headers: ReadonlyHeaders
  // This is mutable because we need to reassign it when transitioning from the action phase to the render phase.
  // The cookie object itself is deliberately read only and thus can't be updated.
  cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly userspaceMutableCookies: ResponseCookies
  readonly draftMode: DraftModeProvider
  readonly isHmrRefresh?: boolean
  readonly serverComponentsHmrCache?: ServerComponentsHmrCache

  readonly implicitTags: string[]

  // DEV-only
  usedDynamic?: boolean
  prerenderPhase?: boolean
} & PhasePartial

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
export type PrerenderStoreModern = {
  type: 'prerender'
  readonly implicitTags: string[]
  /**
   * This is the AbortController passed to React. It can be used to abort the prerender
   * if we encounter conditions that do not require further rendering
   */
  readonly controller: null | AbortController

  /**
   * when not null this signal is used to track cache reads during prerendering and
   * to await all cache reads completing before aborting the prerender.
   */
  readonly cacheSignal: null | CacheSignal

  /**
   * This signal is used to clean up the prerender once it is complete.
   */
  readonly renderSignal: AbortSignal

  /**
   * During some prerenders we want to track dynamic access.
   */
  readonly dynamicTracking: null | DynamicTrackingState

  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]

  // DEV ONLY
  // When used this flag informs certain APIs to skip logging because we're
  // not part of the primary render path and are just prerendering to produce
  // validation results
  validating?: boolean
} & PhasePartial

export type PrerenderStorePPR = {
  type: 'prerender-ppr'
  readonly implicitTags: string[]
  readonly dynamicTracking: null | DynamicTrackingState
  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]
} & PhasePartial

export type PrerenderStoreLegacy = {
  type: 'prerender-legacy'
  readonly implicitTags: string[]
  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]
} & PhasePartial

export type PrerenderStore =
  | PrerenderStoreLegacy
  | PrerenderStorePPR
  | PrerenderStoreModern

export type UseCacheStore = {
  type: 'cache'
  readonly implicitTags: string[]
  // Collected revalidate times and tags for this cache entry during the cache render.
  revalidate: number // implicit revalidate time from inner caches / fetches
  expire: number // server expiration time
  stale: number // client expiration time
  explicitRevalidate: undefined | number // explicit revalidate time from cacheLife() calls
  explicitExpire: undefined | number // server expiration time
  explicitStale: undefined | number // client expiration time
  tags: null | string[]
} & PhasePartial

export type UnstableCacheStore = {
  type: 'unstable-cache'
} & PhasePartial

/**
 * The Cache store is for tracking information inside a "use cache" or unstable_cache context.
 * Inside this context we should never expose any request or page specific information.
 */
export type CacheStore = UseCacheStore | UnstableCacheStore

export type WorkUnitStore = RequestStore | CacheStore | PrerenderStore

export type WorkUnitAsyncStorage = AsyncLocalStorage<WorkUnitStore>

export { workUnitAsyncStorage }

export function getExpectedRequestStore(
  callingExpression: string
): RequestStore {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    if (workUnitStore.type === 'request') {
      return workUnitStore
    }
    if (
      workUnitStore.type === 'prerender' ||
      workUnitStore.type === 'prerender-ppr' ||
      workUnitStore.type === 'prerender-legacy'
    ) {
      // This should not happen because we should have checked it already.
      throw new Error(
        `\`${callingExpression}\` cannot be called inside a prerender. This is a bug in Next.js.`
      )
    }
    if (workUnitStore.type === 'cache') {
      throw new Error(
        `\`${callingExpression}\` cannot be called inside "use cache". Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
    } else if (workUnitStore.type === 'unstable-cache') {
      throw new Error(
        `\`${callingExpression}\` cannot be called inside unstable_cache. Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
  }
  throw new Error(
    `\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
  )
}
