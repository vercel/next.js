import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../async-storage/draft-mode-provider'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { CacheSignal } from './cache-signal'
import type { DynamicTrackingState } from './dynamic-rendering'

// Share the instance module in the next-shared layer
import { workUnitAsyncStorageInstance } from './work-unit-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { ServerComponentsHmrCache } from '../response-cache'
import type {
  RenderResumeDataCache,
  PrerenderResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import type { Params } from '../request/params'
import type { ImplicitTags } from '../lib/implicit-tags'
import type { WorkStore } from './work-async-storage.external'
import { NEXT_HMR_REFRESH_HASH_COOKIE } from '../../client/components/app-router-headers'

export type WorkUnitPhase = 'action' | 'render' | 'after'

export interface CommonWorkUnitStore {
  /** NOTE: Will be mutated as phases change */
  phase: WorkUnitPhase
  readonly implicitTags: ImplicitTags
}

export interface RequestStore extends CommonWorkUnitStore {
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

  readonly rootParams: Params

  /**
   * The resume data cache for this request. This will be a immutable cache.
   */
  renderResumeDataCache: RenderResumeDataCache | null

  // DEV-only
  usedDynamic?: boolean
  prerenderPhase?: boolean
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
export interface PrerenderStoreModern extends CommonWorkUnitStore {
  type: 'prerender'

  /**
   * This signal is aborted when the React render is complete. (i.e. it is the same signal passed to react)
   */
  readonly renderSignal: AbortSignal
  /**
   * This is the AbortController which represents the boundary between Prerender and dynamic. In some renders it is
   * the same as the controller for the renderSignal but in others it is a separate controller. It should be aborted
   * whenever the we are no longer in the prerender phase of rendering. Typically this is after one task or when you call
   * a sync API which requires the prerender to end immediately
   */
  readonly controller: AbortController

  /**
   * when not null this signal is used to track cache reads during prerendering and
   * to await all cache reads completing before aborting the prerender.
   */
  readonly cacheSignal: null | CacheSignal

  /**
   * During some prerenders we want to track dynamic access.
   */
  readonly dynamicTracking: null | DynamicTrackingState

  readonly rootParams: Params

  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]

  /**
   * The resume data cache for this prerender.
   */
  prerenderResumeDataCache: PrerenderResumeDataCache | null

  /**
   * The HMR refresh hash is only provided in dev mode. It is needed for the dev
   * warmup render to ensure that the cache keys will be identical for the
   * subsequent dynamic render.
   */
  readonly hmrRefreshHash: string | undefined
}

export interface PrerenderStorePPR extends CommonWorkUnitStore {
  type: 'prerender-ppr'
  readonly rootParams: Params
  readonly dynamicTracking: null | DynamicTrackingState
  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]

  /**
   * The resume data cache for this prerender.
   */
  prerenderResumeDataCache: PrerenderResumeDataCache
}

export interface PrerenderStoreLegacy extends CommonWorkUnitStore {
  type: 'prerender-legacy'
  readonly rootParams: Params
  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]
}

export type PrerenderStore =
  | PrerenderStoreLegacy
  | PrerenderStorePPR
  | PrerenderStoreModern

export interface CommonCacheStore
  extends Omit<CommonWorkUnitStore, 'implicitTags'> {
  /**
   * A cache work unit store might not always have an outer work unit store,
   * from which implicit tags could be inherited.
   */
  readonly implicitTags: ImplicitTags | undefined
  /**
   * Draft mode is only available if the outer work unit store is a request
   * store and draft mode is enabled.
   */
  readonly draftMode: DraftModeProvider | undefined
}

export interface CommonUseCacheStore extends CommonCacheStore {
  /**
   * The cache kind, e.g. `"remote"` for `"use cache: remote"`.
   */
  readonly kind: string
  // Collected revalidate times and tags for this cache entry during the cache render.
  revalidate: number // implicit revalidate time from inner caches / fetches
  expire: number // server expiration time
  stale: number // client expiration time
  explicitRevalidate: undefined | number // explicit revalidate time from cacheLife() calls
  explicitExpire: undefined | number // server expiration time
  explicitStale: undefined | number // client expiration time
  tags: null | string[]
  readonly hmrRefreshHash: string | undefined
  readonly isHmrRefresh: boolean
  readonly serverComponentsHmrCache: ServerComponentsHmrCache | undefined
  readonly forceRevalidate: boolean
}

export interface UseCacheStore extends CommonUseCacheStore {
  readonly type: 'cache'
  readonly cookies: (() => Promise<ReadonlyRequestCookies>) | undefined
}

// export interface UseCacheWithCookiesStore extends CommonUseCacheStore {
//   readonly type: 'cache-with-cookies'
// }

export interface UnstableCacheStore extends CommonCacheStore {
  readonly type: 'unstable-cache'
}

/**
 * The Cache store is for tracking information inside a "use cache" or
 * unstable_cache context. A cache store shadows an outer request store (if
 * present) as a work unit, so that we never accidentally expose any request or
 * page specific information to cache functions, unless it's explicitly desired.
 * For those exceptions, the data is copied over from the request store to the
 * cache store, instead of generally making the request store available to cache
 * functions.
 */
export type CacheStore =
  | UseCacheStore
  // | UseCacheWithCookiesStore
  | UnstableCacheStore

export type WorkUnitStore = RequestStore | CacheStore | PrerenderStore

export type WorkUnitAsyncStorage = AsyncLocalStorage<WorkUnitStore>

export { workUnitAsyncStorageInstance as workUnitAsyncStorage }

export function getExpectedRequestStore(
  callingExpression: string
): RequestStore {
  const workUnitStore = workUnitAsyncStorageInstance.getStore()

  if (!workUnitStore) {
    throwForMissingRequestStore(callingExpression)
  }

  switch (workUnitStore.type) {
    case 'request':
      return workUnitStore

    case 'prerender':
    case 'prerender-ppr':
    case 'prerender-legacy':
      // This should not happen because we should have checked it already.
      throw new Error(
        `\`${callingExpression}\` cannot be called inside a prerender. This is a bug in Next.js.`
      )

    case 'cache':
      // case 'cache-with-cookies':
      throw new Error(
        `\`${callingExpression}\` cannot be called inside "use cache". Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )

    case 'unstable-cache':
      throw new Error(
        `\`${callingExpression}\` cannot be called inside unstable_cache. Call it outside and pass an argument instead. Read more: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )

    default:
      const _exhaustiveCheck: never = workUnitStore
      return _exhaustiveCheck
  }
}

export function throwForMissingRequestStore(callingExpression: string): never {
  throw new Error(
    `\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
  )
}

export function getPrerenderResumeDataCache(
  workUnitStore: WorkUnitStore
): PrerenderResumeDataCache | null {
  if (
    workUnitStore.type === 'prerender' ||
    workUnitStore.type === 'prerender-ppr'
  ) {
    return workUnitStore.prerenderResumeDataCache
  }

  return null
}

export function getRenderResumeDataCache(
  workUnitStore: WorkUnitStore
): RenderResumeDataCache | null {
  if (
    workUnitStore.type !== 'prerender-legacy' &&
    workUnitStore.type !== 'cache' &&
    // workUnitStore.type !== 'cache-with-cookies' &&
    workUnitStore.type !== 'unstable-cache'
  ) {
    if (workUnitStore.type === 'request') {
      return workUnitStore.renderResumeDataCache
    }

    // We return the mutable resume data cache here as an immutable version of
    // the cache as it can also be used for reading.
    return workUnitStore.prerenderResumeDataCache
  }

  return null
}

export function getHmrRefreshHash(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): string | undefined {
  if (!workStore.dev) {
    return undefined
  }

  return workUnitStore.type === 'cache' || workUnitStore.type === 'prerender'
    ? workUnitStore.hmrRefreshHash
    : workUnitStore.type === 'request'
      ? workUnitStore.cookies.get(NEXT_HMR_REFRESH_HASH_COOKIE)?.value
      : undefined
}

/**
 * Returns a draft mode provider only if draft mode is enabled.
 */
export function getDraftModeProviderForCacheScope(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): DraftModeProvider | undefined {
  if (workStore.isDraftMode) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'unstable-cache':
      case 'request':
        return workUnitStore.draftMode
      default:
        return undefined
    }
  }

  return undefined
}
