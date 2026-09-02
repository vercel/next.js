import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { FetchMetrics } from '../base-http'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'
import type { AfterContext } from '../after/after-context'
import type { ResolvedCacheLifeProfiles } from '../config-shared'
import type { SharedCacheResult } from '../use-cache/use-cache-wrapper'
import type { ValidationLevel } from '../config-shared'

// Share the instance module in the next-shared layer
import { workAsyncStorageInstance } from './work-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { LazyResult } from '../lib/lazy-result'
import type { DigestedError } from './create-error-handler'
import type { ActionRevalidationKind } from '../../shared/lib/action-revalidation-kind'

export interface WorkStore {
  /**
   * The page that is being rendered. This relates to the path to the page file.
   */
  readonly page: string

  /**
   * The route that is being rendered. This is the page property without the
   * trailing `/page` or `/route` suffix.
   */
  readonly route: string

  readonly incrementalCache?: IncrementalCache
  readonly cacheLifeProfiles: ResolvedCacheLifeProfiles
  readonly useCacheTimeout: number
  readonly durableUseCacheEntries: boolean
  readonly staticPageGenerationTimeout: number

  readonly isOnDemandRevalidate?: boolean
  readonly isBuildTimePrerendering?: boolean

  forceDynamic?: boolean
  fetchCache?: AppSegmentConfig['fetchCache']

  forceStatic?: boolean
  dynamicShouldError?: boolean
  pendingRevalidates?: Record<string, Promise<any>>
  pendingRevalidateWrites?: Array<Promise<void>> // This is like pendingRevalidates but isn't used for deduping.
  readonly afterContext: AfterContext

  dynamicUsageDescription?: string
  dynamicUsageStack?: string

  /**
   * Invalid dynamic usage errors might be caught in userland. We attach them to
   * the work store to ensure we can still fail the build, or show en error in
   * dev mode.
   */
  // TODO: Collect an array of errors, and throw as AggregateError when
  // `serializeError` and the Dev Overlay support it.
  invalidDynamicUsageError?: Error

  nextFetchId?: number
  pathWasRevalidated?: ActionRevalidationKind

  /**
   * Tags that were revalidated during the current request. They need to be sent
   * to cache handlers to propagate their revalidation.
   */
  pendingRevalidatedTags?: Array<{
    tag: string
    profile?: string | { stale?: number; revalidate?: number; expire?: number }
    /**
     * When the tag was revalidated, on the same clock as `CacheEntry.timestamp`
     * (`performance.timeOrigin + performance.now()`). A cache entry created
     * before this is stale; one created after it already reflects the
     * revalidation and can still be served. Re-revalidating a tag moves this
     * forward.
     */
    revalidatedAt: number
  }>

  /**
   * Tags that were previously revalidated (e.g. by a redirecting server action)
   * and have already been sent to cache handlers. Retrieved cache entries that
   * include any of these tags must be discarded.
   */
  readonly previouslyRevalidatedTags: readonly string[]

  /**
   * When this request started, on the same clock as `CacheEntry.timestamp`.
   * `previouslyRevalidatedTags` carry no timestamp of their own, having been
   * revalidated by an earlier request, so they are treated as revalidated at
   * this instant: entries predating the request are discarded, while entries
   * generated during it are not.
   */
  readonly requestStartTime: number

  /**
   * This map contains lazy results so that we can evaluate them when the first
   * cache entry is read. It allows us to skip refreshing tags if no caches are
   * read at all.
   */
  readonly refreshTagsByCacheKind: Map<string, LazyResult<void>>

  fetchMetrics?: FetchMetrics
  shouldTrackFetchMetrics: boolean

  /**
   * Tracks pending `"use cache"` invocations within the current request scope,
   * keyed by the serialized cache key (coarse key). Used for intra-request
   * deduplication: when multiple components call the same cache function within
   * a single request, only the first one runs (cache handler lookup +
   * generation), and joiners tee its result stream.
   * Root params are identical within a request, so the coarse key is sufficient.
   */
  pendingCacheInvocations?: Map<string, Promise<SharedCacheResult>>

  /**
   * Invocations from this request that have already completed, keyed the same
   * way as `pendingCacheInvocations`. Entries move here when their fill
   * finishes rather than being dropped, so a later invocation of the same cache
   * function reuses the entry instead of repeating the cache handler lookup
   * and, on a miss, the work.
   *
   * Only populated for kinds where that saves something real: private caches,
   * which have no cache handler in production, and kinds whose handler was
   * supplied by the platform or by `cacheHandlers` config, whose reads may be
   * remote. A built-in handler read is a map lookup, so retaining its entries
   * would cost memory for nothing.
   */
  completedCacheInvocations?: Map<string, Promise<SharedCacheResult>>

  /**
   * Set by the dev-server's hang-detection probe worker (see
   * `use-cache-probe-worker.ts`) to switch `cache()` into a one-shot fill
   * path: run `generateCacheEntry` as for a cold fill, drain the resulting
   * stream, return. No cache-handler or resume-data-cache I/O, no
   * intra-request leader election — the probe just needs to learn whether
   * the body completes in module-scope isolation.
   */
  readonly useCacheProbeMode?: {
    /**
     * Max wall time the probe fill may take. `cache()` enforces this with
     * `UseCacheTimeoutError`, which the probe worker translates to
     * `{ outcome: 'hung' }` for the parent process.
     */
    readonly timeoutMs: number
  }

  isDraftMode?: boolean
  isUnstableNoStore?: boolean
  isPrefetchRequest?: boolean

  /**
   * Dev-only request identity used by local request insights. requestId
   * identifies one server request, while htmlRequestId groups requests that
   * originated from the same browser page.
   */
  requestId?: string
  htmlRequestId?: string

  /**
   * This only exists because it's needed in use-cache-wrapper
   */
  deploymentId: string
  /**
   * Prefer `sharedContext.buildId` instead. This only exists because it's needed in use-cache-wrapper
   */
  buildId: string

  readonly reactLoadableManifest?: DeepReadonly<
    Record<string, { files: string[] }>
  >
  readonly assetPrefix?: string
  readonly nonce?: string

  cacheComponentsEnabled: boolean
  validationLevel: ValidationLevel

  /**
   * Pages, other than the one being rendered, whose client reference manifest
   * supplied a client reference for this render. Only populated by the dev
   * server, where React's I/O tracking can carry a reference from another page
   * into this render, which `createProxiedClientReferenceManifest` resolves by
   * searching the other pages' manifests. The dev validation worker rebuilds
   * that registry in its own thread from the route it validates, so it relies
   * on this to know which other manifests to register.
   */
  additionalClientReferenceManifestPages?: Set<string>

  /**
   * Run the given function inside a clean AsyncLocalStorage snapshot. This is
   * useful when generating cache entries, to ensure that the cache generation
   * cannot read anything from the context we're currently executing in, which
   * might include request-specific things like `cookies()` inside a
   * `React.cache()`.
   */
  runInCleanSnapshot: <R, TArgs extends any[]>(
    fn: (...args: TArgs) => R,
    ...args: TArgs
  ) => R

  reactServerErrorsByDigest: Map<string, DigestedError>
}

export type WorkAsyncStorage = AsyncLocalStorage<WorkStore>

export { workAsyncStorageInstance as workAsyncStorage }
