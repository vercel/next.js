import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../../server/async-storage/draft-mode-provider'
import type { ResponseCookies } from '../../server/web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../../server/web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../../server/web/spec-extension/adapters/request-cookies'
import type { CacheSignal } from './cache-signal'
import type { DynamicTrackingState } from './dynamic-rendering'

// Share the instance module in the next-shared layer
import { workUnitAsyncStorage } from './work-unit-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { ServerComponentsHmrCache } from '../../server/response-cache'

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
  readonly cookies: ReadonlyRequestCookies
  readonly mutableCookies: ResponseCookies
  readonly draftMode: DraftModeProvider
  readonly isHmrRefresh?: boolean
  readonly serverComponentsHmrCache?: ServerComponentsHmrCache
}

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
  pathname: string | undefined
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
}

export type PrerenderStorePPR = {
  type: 'prerender-ppr'
  pathname: string | undefined
  readonly dynamicTracking: null | DynamicTrackingState
}

export type PrerenderStoreLegacy = {
  type: 'prerender-legacy'
  pathname: string | undefined
}

export type PrerenderStore =
  | PrerenderStoreLegacy
  | PrerenderStorePPR
  | PrerenderStoreModern

export type UseCacheStore = {
  type: 'cache'
  // TODO: Inside this scope we'll track tags and life times of this scope.
}

export type UnstableCacheStore = {
  type: 'unstable-cache'
}

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
