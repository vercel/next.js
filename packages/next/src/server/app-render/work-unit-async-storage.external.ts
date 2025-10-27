import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../async-storage/draft-mode-provider'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { CacheSignal } from './cache-signal'
import type { DynamicTrackingState } from './dynamic-rendering'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'

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
import { InvariantError } from '../../shared/lib/invariant-error'
import type { StagedRenderingController } from './staged-rendering'

export type WorkUnitPhase = 'action' | 'render' | 'after'

export interface CommonWorkUnitStore {
  /** NOTE: Will be mutated as phases change */
  phase: WorkUnitPhase
  readonly implicitTags: ImplicitTags
}

export interface RequestStore extends CommonWorkUnitStore {
  readonly type: 'request'

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
  devFallbackParams?: OpaqueFallbackRouteParams | null
  stagedRendering?: StagedRenderingController | null
  asyncApiPromises?: DevAsyncApiPromises
  cacheSignal?: CacheSignal | null
  prerenderResumeDataCache?: PrerenderResumeDataCache | null
}

type DevAsyncApiPromises = {
  cookies: Promise<ReadonlyRequestCookies>
  mutableCookies: Promise<ReadonlyRequestCookies>
  headers: Promise<ReadonlyHeaders>

  sharedParamsParent: Promise<string>
  sharedSearchParamsParent: Promise<string>

  connection: Promise<undefined>
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
export type PrerenderStoreModern =
  | PrerenderStoreModernClient
  | PrerenderStoreModernServer
  | PrerenderStoreModernRuntime

/** Like `PrerenderStoreModern`, but only including static prerenders (i.e. not runtime prerenders) */
export type StaticPrerenderStoreModern = Exclude<
  PrerenderStoreModern,
  PrerenderStoreModernRuntime
>

export interface PrerenderStoreModernClient
  extends PrerenderStoreModernCommon,
    StaticPrerenderStoreCommon {
  readonly type: 'prerender-client'
}

export interface PrerenderStoreModernServer
  extends PrerenderStoreModernCommon,
    StaticPrerenderStoreCommon {
  readonly type: 'prerender'
}

export interface PrerenderStoreModernRuntime
  extends PrerenderStoreModernCommon {
  readonly type: 'prerender-runtime'

  /**
   * A runtime prerender resolves APIs in two tasks:
   *
   * 1. Static data (available in a static prerender)
   * 2. Runtime data (available in a runtime prerender)
   *
   * This separation is achieved by awaiting this promise in "runtime" APIs.
   * In the final prerender, the promise will be resolved during the second task,
   * and the render will be aborted in the task that follows it.
   */
  readonly runtimeStagePromise: Promise<void> | null

  readonly headers: RequestStore['headers']
  readonly cookies: RequestStore['cookies']
  readonly draftMode: RequestStore['draftMode']
}

export interface RevalidateStore {
  // Collected revalidate times and tags for this document during the prerender.
  revalidate: number // in seconds. 0 means dynamic. INFINITE_CACHE and higher means never revalidate.
  expire: number // server expiration time
  stale: number // client expiration time
  tags: null | string[]
}

interface PrerenderStoreModernCommon
  extends CommonWorkUnitStore,
    RevalidateStore {
  /**
   * The render signal is aborted after React's `prerender` function is aborted
   * (using a separate signal), which happens in two cases:
   *
   * 1. When all caches are filled during the prospective prerender.
   * 2. When the final prerender is aborted immediately after the prerender was
   *    started.
   *
   * It can be used to reject any pending I/O, including hanging promises. This
   * allows React to properly track the async I/O in dev mode, which yields
   * better owner stacks for dynamic validation errors.
   */
  readonly renderSignal: AbortSignal

  /**
   * This is the AbortController which represents the boundary between Prerender
   * and dynamic. In some renders it is the same as the controller for React,
   * but in others it is a separate controller. It should be aborted whenever we
   * are no longer in the prerender phase of rendering. Typically this is after
   * one task, or when you call a sync API which requires the prerender to end
   * immediately.
   */
  readonly controller: AbortController

  /**
   * When not null, this signal is used to track cache reads during prerendering
   * and to await all cache reads completing, before aborting the prerender.
   */
  readonly cacheSignal: null | CacheSignal

  /**
   * During some prerenders we want to track dynamic access.
   */
  readonly dynamicTracking: null | DynamicTrackingState

  readonly rootParams: Params

  /**
   * A mutable resume data cache for this prerender.
   */
  prerenderResumeDataCache: PrerenderResumeDataCache | null

  /**
   * An immutable resume data cache for this prerender. This may be provided
   * instead of the `prerenderResumeDataCache` if the prerender is not supposed
   * to fill caches, and only read from prefilled caches, e.g. when prerendering
   * an optional fallback shell.
   */
  renderResumeDataCache: RenderResumeDataCache | null

  /**
   * The HMR refresh hash is only provided in dev mode. It is needed for the dev
   * warmup render to ensure that the cache keys will be identical for the
   * subsequent dynamic render.
   */
  readonly hmrRefreshHash: string | undefined

  /**
   * Only available in dev mode.
   */
  readonly captureOwnerStack: undefined | (() => string | null)
}

interface StaticPrerenderStoreCommon {
  /**
   * The set of unknown route parameters. Accessing these will be tracked as
   * a dynamic access.
   */
  readonly fallbackRouteParams: OpaqueFallbackRouteParams | null

  /**
   * When true, the page is prerendered as a fallback shell, while allowing any
   * dynamic accesses to result in an empty shell. This is the case when there
   * are also routes prerendered with a more complete set of params.
   * Prerendering those routes would catch any invalid dynamic accesses.
   */
  readonly allowEmptyStaticShell: boolean
}

export interface PrerenderStorePPR
  extends CommonWorkUnitStore,
    RevalidateStore {
  readonly type: 'prerender-ppr'
  readonly rootParams: Params
  readonly dynamicTracking: null | DynamicTrackingState

  /**
   * The set of unknown route parameters. Accessing these will be tracked as
   * a dynamic access.
   */
  readonly fallbackRouteParams: OpaqueFallbackRouteParams | null

  /**
   * The resume data cache for this prerender.
   */
  prerenderResumeDataCache: PrerenderResumeDataCache
}

export interface PrerenderStoreLegacy
  extends CommonWorkUnitStore,
    RevalidateStore {
  readonly type: 'prerender-legacy'
  readonly rootParams: Params
}

export type PrerenderStore =
  | PrerenderStoreLegacy
  | PrerenderStorePPR
  | PrerenderStoreModern

// /** Like `PrerenderStoreModern`, but only including static prerenders (i.e. not runtime prerenders) */
export type StaticPrerenderStore = Exclude<
  PrerenderStore,
  PrerenderStoreModernRuntime
>

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

export interface CommonUseCacheStore extends CommonCacheStore, RevalidateStore {
  explicitRevalidate: undefined | number // explicit revalidate time from cacheLife() calls
  explicitExpire: undefined | number // server expiration time
  explicitStale: undefined | number // client expiration time
  readonly hmrRefreshHash: string | undefined
  readonly isHmrRefresh: boolean
  readonly serverComponentsHmrCache: ServerComponentsHmrCache | undefined
  readonly forceRevalidate: boolean
}

export interface PublicUseCacheStore extends CommonUseCacheStore {
  readonly type: 'cache'
}

export interface PrivateUseCacheStore extends CommonUseCacheStore {
  readonly type: 'private-cache'

  /**
   * A runtime prerender resolves APIs in two tasks:
   *
   * 1. Static data (available in a static prerender)
   * 2. Runtime data (available in a runtime prerender)
   *
   * This separation is achieved by awaiting this promise in "runtime" APIs.
   * In the final prerender, the promise will be resolved during the second task,
   * and the render will be aborted in the task that follows it.
   */
  readonly runtimeStagePromise: Promise<void> | null

  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies

  /**
   * Private caches don't currently need to track root params in the cache key
   * because they're not persisted anywhere, so we can allow root params access
   * (unlike public caches)
   */
  readonly rootParams: Params
}

export type UseCacheStore = PublicUseCacheStore | PrivateUseCacheStore

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
export type CacheStore = UseCacheStore | UnstableCacheStore

export type WorkUnitStore = RequestStore | CacheStore | PrerenderStore

export type WorkUnitAsyncStorage = AsyncLocalStorage<WorkUnitStore>

export { workUnitAsyncStorageInstance as workUnitAsyncStorage }

export function throwForMissingRequestStore(callingExpression: string): never {
  throw new Error(
    `\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
  )
}

export function throwInvariantForMissingStore(): never {
  throw new InvariantError('Expected workUnitAsyncStorage to have a store.')
}

export function getPrerenderResumeDataCache(
  workUnitStore: WorkUnitStore
): PrerenderResumeDataCache | null {
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime':
    case 'prerender-ppr':
      return workUnitStore.prerenderResumeDataCache
    case 'prerender-client':
      // TODO eliminate fetch caching in client scope and stop exposing this data
      // cache during SSR.
      return workUnitStore.prerenderResumeDataCache
    case 'request': {
      // In dev, we might fill caches even during a dynamic request.
      if (workUnitStore.prerenderResumeDataCache) {
        return workUnitStore.prerenderResumeDataCache
      }
      // fallthrough
    }
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getRenderResumeDataCache(
  workUnitStore: WorkUnitStore
): RenderResumeDataCache | null {
  switch (workUnitStore.type) {
    case 'request':
    case 'prerender':
    case 'prerender-runtime':
    case 'prerender-client':
      if (workUnitStore.renderResumeDataCache) {
        // If we are in a prerender, we might have a render resume data cache
        // that is used to read from prefilled caches.
        return workUnitStore.renderResumeDataCache
      }
    // fallthrough
    case 'prerender-ppr':
      // Otherwise we return the mutable resume data cache here as an immutable
      // version of the cache as it can also be used for reading.
      return workUnitStore.prerenderResumeDataCache ?? null
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'prerender-legacy':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getHmrRefreshHash(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): string | undefined {
  if (workStore.dev) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'prerender':
      case 'prerender-runtime':
        return workUnitStore.hmrRefreshHash
      case 'request':
        return workUnitStore.cookies.get(NEXT_HMR_REFRESH_HASH_COOKIE)?.value
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return undefined
}

export function isHmrRefresh(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): boolean {
  if (workStore.dev) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'request':
        return workUnitStore.isHmrRefresh ?? false
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return false
}

export function getServerComponentsHmrCache(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore
): ServerComponentsHmrCache | undefined {
  if (workStore.dev) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'request':
        return workUnitStore.serverComponentsHmrCache
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return undefined
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
      case 'private-cache':
      case 'unstable-cache':
      case 'prerender-runtime':
      case 'request':
        return workUnitStore.draftMode
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return undefined
}

export function getCacheSignal(
  workUnitStore: WorkUnitStore
): CacheSignal | null {
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-client':
    case 'prerender-runtime':
      return workUnitStore.cacheSignal
    case 'request': {
      // In dev, we might fill caches even during a dynamic request.
      if (workUnitStore.cacheSignal) {
        return workUnitStore.cacheSignal
      }
      // fallthrough
    }
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getRuntimeStagePromise(
  workUnitStore: WorkUnitStore
): Promise<void> | null {
  switch (workUnitStore.type) {
    case 'prerender-runtime':
    case 'private-cache':
      return workUnitStore.runtimeStagePromise
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'unstable-cache':
      return null
    default:
      return workUnitStore satisfies never
  }
}
