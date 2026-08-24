import type { AsyncLocalStorage } from 'async_hooks'
import type { DraftModeProvider } from '../async-storage/draft-mode-provider'
import type { ResponseCookies } from '../web/spec-extension/cookies'
import type { ReadonlyHeaders } from '../web/spec-extension/adapters/headers'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { CacheSignal } from './cache-signal'
import type { ResponseVaryParamsAccumulator } from './vary-params'
import type { DynamicTrackingState } from './dynamic-rendering'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'

// Share the instance module in the next-shared layer
import { workUnitAsyncStorageInstance } from './work-unit-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { ServerComponentsHmrCache } from '../response-cache'
import type { ResumeDataCache } from '../resume-data-cache/resume-data-cache'
import type { Params } from '../request/params'
import type { ImplicitTags } from '../lib/implicit-tags'
import type { WorkStore } from './work-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { StagedRenderingController } from './staged-rendering'
import type { ValidationBoundaryTracking } from './instant-validation/boundary-tracking'
import type { InstantValidationSampleTracking } from './instant-validation/instant-samples'

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
  readonly hmrRefreshHash?: string

  readonly rootParams: Params

  /**
   * The resume data cache for this request. Either a mutable
   * `PrerenderResumeDataCache` (e.g. during a dev warmup that fills caches) or
   * an immutable `RenderResumeDataCache` (e.g. when resuming from a postponed
   * state). Narrow via `resumeDataCache.mutable` to tell them apart.
   */
  resumeDataCache: ResumeDataCache | null

  stale?: number

  stagedRendering?: StagedRenderingController | null
  asyncApiPromises?: AsyncApiPromises

  /**
   * DEV-only.
   * Certain APIs have different behavior in static and runtime prerenders.
   * - if `false`, they will follow static semantics
   * - if `true`, they will follow runtime semantics
   * */
  needsAppShell?: boolean // DEV-only
  /**
   * DEV-only, mutable.
   * Whether any APIs that resolve in different stages in static and
   * runtime prerenders (i.e. whose behavior varies on `needsAppShell`)
   * were used during this render.
   * */
  hasIncompatibleShellContent?: boolean

  cacheSignal?: CacheSignal | null
  fallbackParams?: OpaqueFallbackRouteParams | null
  varyParamsAccumulator?: ResponseVaryParamsAccumulator | null

  // Only in build-time instant-validation or when rendering
  // a secondary stream for static shell validation
  // We mirror the controller/renderSignal from prerender stores to allow aborting the render
  controller?: AbortController
  renderSignal?: AbortSignal

  // Only in build-time instant-validation
  validationSamples?: InstantValidationSamples
  validationSampleTracking?: InstantValidationSampleTracking | null

  // DEV-only
  usedDynamic?: boolean
}

export type InstantValidationSamples = {
  params: Params | undefined
  searchParams: Record<string, string | string[] | null> | undefined
}

export type AsyncApiPromises = {
  cookies: Promise<ReadonlyRequestCookies>
  mutableCookies: Promise<ReadonlyRequestCookies>
  headers: Promise<ReadonlyHeaders>
  sharedParamsParent: Promise<string>
  sharedSearchParamsParent: Promise<string>
  connection: Promise<undefined>
  io: Promise<undefined>
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
  | ValidationStoreClient

/** Like `PrerenderStoreModern`, but only including static prerenders (i.e. not runtime prerenders) */
export type StaticPrerenderStoreModern = Exclude<
  PrerenderStoreModern,
  PrerenderStoreModernRuntime | ValidationStoreClient
>

export interface PrerenderStoreModernClient
  extends PrerenderStoreModernCommon,
    StaticPrerenderStoreCommon {
  readonly type: 'prerender-client'
}

export interface ValidationStoreClient extends PrerenderStoreModernCommon {
  readonly type: 'validation-client'
  readonly boundaryState: ValidationBoundaryTracking | null
  validationSamples: InstantValidationSamples | null
  validationSampleTracking: InstantValidationSampleTracking | null
  fallbackRouteParams: OpaqueFallbackRouteParams | null
}

export interface PrerenderStoreModernServer
  extends PrerenderStoreModernCommon,
    StaticPrerenderStoreCommon {
  readonly type: 'prerender'

  readonly stagedRendering: StagedRenderingController | null

  /**
   * When not null, records whether the render has accessed a data source
   * that hangs during a static prerender but would resolve during a runtime
   * prerender — cookies, headers, fallback params, searchParams, and cache
   * entries excluded only from static prerenders. Call sites go through
   * `trackRuntimeDataAccessed`, which resolves the promise `true` on the
   * first access; it's resolved `false` when the prerender completes without
   * one. Promise resolution is idempotent, so the flag is monotonic with no
   * extra state.
   *
   * The promise is embedded in the RSC payload (`InitialRSCPayload['u']`)
   * so the fulfillment row's stream position records the stage the access
   * happened in; the per-segment prefetch encoding (`collectSegmentData`)
   * extracts it from the page data to tell the client whether a runtime
   * prefetch request could be skipped. Tracking is page-global: an access
   * anywhere in the page poisons all segments (per-segment granularity is
   * recovered downstream for segments whose content is provably complete).
   * Shared between the payload prerender store and the render store because
   * request-data props are created during payload construction, before the
   * render store exists. Null for warmup, route-handler, and error prerender
   * stores.
   */
  readonly runtimeDataAccessed: PromiseWithResolvers<boolean> | null

  /**
   * Mutable single-boolean companion to `runtimeDataAccessed`, holding this
   * prerender's `PrefetchHint.ShouldAttemptStaticPrefetch` measurement
   * directly — the value that becomes the route's build-constant hint:
   * starts `true`, and a disqualifying runtime-data access flips it to
   * `false`. Not every access that resolves the promise disqualifies —
   * fallback-param accesses on a fallback-upgradeable route are transient
   * and leave the hint intact (see `trackRuntimeDataAccessed`, which applies
   * the rule at access time using `isFallbackUpgradeable` below). A plain
   * boolean suffices because the hint needs no stream positioning: unlike
   * `runtimeDataAccessed`, whose fulfillment position encodes which stage
   * the access happened in, this is read once after the prerender settles.
   * Held in a cell so it can be shared. Same sharing and null rules as
   * `runtimeDataAccessed`.
   */
  readonly shouldAttemptStaticPrefetch: { current: boolean } | null

  /**
   * Whether a fallback shell produced by this prerender could later be
   * upgraded to a concrete prerender (`renderOpts.isFallbackUpgradeable`:
   * at least one fallback param is a `generateStaticParams` candidate).
   * Consulted by `trackRuntimeDataAccessed` to decide whether a
   * fallback-param access disqualifies the static-prefetch hint.
   */
  readonly isFallbackUpgradeable: boolean
}

export interface PrerenderStoreModernRuntime
  extends PrerenderStoreModernCommon {
  readonly type: 'prerender-runtime'

  /**
   * The staged rendering controller for this prerender. Models stage
   * transitions (Before → Static → Runtime → Dynamic). Null for prospective
   * renders where all stages run without sequencing.
   */
  readonly stagedRendering: StagedRenderingController | null
  readonly isSessionShell: boolean

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
   * The resume data cache for this prerender. Either a mutable
   * `PrerenderResumeDataCache` that fills as this prerender runs, or an
   * immutable `RenderResumeDataCache` provided by an earlier phase when the
   * prerender is supposed to read from prefilled caches only (e.g. when
   * prerendering an optional fallback shell). Narrow via
   * `resumeDataCache.mutable` to tell them apart.
   */
  resumeDataCache: ResumeDataCache | null

  /**
   * The HMR refresh hash is only provided in dev mode. It is needed for the dev
   * warmup render to ensure that the cache keys will be identical for the
   * subsequent dynamic render.
   */
  readonly hmrRefreshHash: string | undefined

  /**
   * A mutable accumulator for per-segment vary params during prerender. Tracks
   * which route params each segment actually accesses, allowing the client
   * cache to re-key entries for better sharing across different param values.
   */
  readonly varyParamsAccumulator: ResponseVaryParamsAccumulator | null
}

interface StaticPrerenderStoreCommon {
  /**
   * The set of unknown route parameters. Accessing these will be tracked as
   * a dynamic access.
   */
  readonly fallbackRouteParams: OpaqueFallbackRouteParams | null
}

export interface PrerenderStoreLegacy
  extends CommonWorkUnitStore,
    RevalidateStore {
  readonly type: 'prerender-legacy'
  readonly rootParams: Params
}

export type PrerenderStore = PrerenderStoreLegacy | PrerenderStoreModern

// /** Like `PrerenderStoreModern`, but only including static prerenders (i.e. not runtime prerenders) */
export type StaticPrerenderStore = Exclude<
  PrerenderStore,
  PrerenderStoreModernRuntime | ValidationStoreClient
>

export interface CommonCacheStore
  extends Omit<CommonWorkUnitStore, 'implicitTags'> {
  /**
   * Whether this work unit will persist the results it consumes in a server
   * cache. This only describes the immediate consumer; it is not inherited
   * from outer scopes.
   */
  readonly consumerWillServerCache: boolean
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
  readonly outerOwnerStack: string | undefined
}

export interface PublicUseCacheStore extends CommonUseCacheStore {
  readonly type: 'cache'

  /**
   * The root params for the current route. `undefined` when nested inside
   * `unstable_cache`, which doesn't carry root params. Currently, `"use cache"`
   * inside `unstable_cache` is allowed, so this case must be handled. The error
   * message in `getRootParam` assumes this is the only scenario where
   * `rootParams` is `undefined`.
   */
  readonly rootParams: Params | undefined
  /**
   * Tracks which root param names were read during this cache invocation.
   */
  readonly readRootParamNames: Set<string>
  /**
   * The first nested public `'use cache'` invocation with a dynamic cache life
   * (`revalidate === 0` or `expire < MIN_PRERENDERABLE_EXPIRE`) that propagated
   * up to this store. Used as `cause` for the nested-dynamic cache error so the
   * redbox can point at the inner invocation site, not just the outer one.
   */
  dynamicNestedCacheError: Error | undefined
}

export interface PrivateUseCacheStore extends CommonUseCacheStore {
  readonly type: 'private-cache'

  readonly headers: ReadonlyHeaders
  readonly cookies: ReadonlyRequestCookies

  readonly rootParams: Params

  /**
   * DEV-only: Tracks which root param names were read during this cache
   * invocation. In development, private caches are persisted (keyed by the
   * request's cookies and headers), so reads of different root param values
   * must produce different entries.
   */
  readonly readRootParamNames: Set<string> | undefined
}

export type UseCacheStore = PublicUseCacheStore | PrivateUseCacheStore

export interface UnstableCacheStore extends CommonCacheStore {
  readonly type: 'unstable-cache'
  /**
   * Always `undefined` for `unstable_cache` — root params are not available in
   * this context. If a `"use cache"` function nested inside `unstable_cache`
   * tries to access root params, it will encounter `undefined` here and throw.
   */
  readonly rootParams: undefined
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

export interface GenerateStaticParamsStore extends CommonWorkUnitStore {
  readonly type: 'generate-static-params'
  readonly rootParams: Params
}

export type WorkUnitStore =
  | RequestStore
  | CacheStore
  | PrerenderStore
  | GenerateStaticParamsStore

export function willConsumerServerCache(
  workUnitStore: WorkUnitStore | undefined
): boolean {
  if (!workUnitStore) {
    return false
  }

  switch (workUnitStore.type) {
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
      return workUnitStore.consumerWillServerCache
    case 'prerender':
    case 'prerender-client':
    case 'prerender-legacy':
      return true
    case 'request':
    case 'prerender-runtime':
    case 'validation-client':
    case 'generate-static-params':
      return false
    default:
      return workUnitStore satisfies never
  }
}

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

/**
 * Returns the resume data cache for the given work unit store, regardless of
 * whether it is mutable (`PrerenderResumeDataCache`) or read-only
 * (`RenderResumeDataCache`). Use `resumeDataCache.mutable` to narrow.
 */
export function getResumeDataCache(
  workUnitStore: WorkUnitStore
): ResumeDataCache | null {
  switch (workUnitStore.type) {
    case 'request':
    case 'prerender':
    case 'prerender-runtime':
    case 'prerender-client':
    case 'validation-client':
      return workUnitStore.resumeDataCache
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'prerender-legacy':
    case 'generate-static-params':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getHmrRefreshHash(
  workUnitStore: WorkUnitStore
): string | undefined {
  if (process.env.__NEXT_DEV_SERVER) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'prerender':
      case 'prerender-runtime':
      case 'request':
        return workUnitStore.hmrRefreshHash
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'generate-static-params':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return undefined
}

export function isHmrRefresh(workUnitStore: WorkUnitStore): boolean {
  if (process.env.__NEXT_DEV_SERVER) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'request':
        return workUnitStore.isHmrRefresh ?? false
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'generate-static-params':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return false
}

export function getServerComponentsHmrCache(
  workUnitStore: WorkUnitStore
): ServerComponentsHmrCache | undefined {
  if (process.env.__NEXT_DEV_SERVER) {
    switch (workUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'request':
        return workUnitStore.serverComponentsHmrCache
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'generate-static-params':
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
      case 'validation-client':
      case 'prerender-legacy':
      case 'generate-static-params':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return undefined
}

export function getStagedRenderingController(
  workUnitStore: WorkUnitStore
): StagedRenderingController | null {
  switch (workUnitStore.type) {
    case 'request':
    case 'prerender-runtime':
    case 'prerender':
      return workUnitStore.stagedRendering ?? null
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getCacheSignal(
  workUnitStore: WorkUnitStore
): CacheSignal | null {
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-runtime':
      return workUnitStore.cacheSignal
    case 'request': {
      // In dev, we might fill caches even during a dynamic request.
      if (workUnitStore.cacheSignal) {
        return workUnitStore.cacheSignal
      }
      // fallthrough
    }
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      return null
    default:
      return workUnitStore satisfies never
  }
}

export function getVaryParamsAccumulator(
  workUnitStore: WorkUnitStore
): ResponseVaryParamsAccumulator | null {
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime':
    case 'request': {
      return workUnitStore.varyParamsAccumulator ?? null
    }
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'prerender-client':
    case 'validation-client':
    case 'unstable-cache':
    case 'generate-static-params':
      return null
    default:
      workUnitStore satisfies never
      return null
  }
}
