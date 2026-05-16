import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { FetchMetrics } from '../base-http'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'
import type { AfterContext } from '../after/after-context'
import type { CacheLife } from '../use-cache/cache-life'
import type { SharedCacheResult } from '../use-cache/use-cache-wrapper'
import type { ValidationLevel } from '../config-shared'

// Share the instance module in the next-shared layer
import { workAsyncStorageInstance } from './work-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { LazyResult } from '../lib/lazy-result'
import type { DigestedError } from './create-error-handler'
import type { ActionRevalidationKind } from '../../shared/lib/action-revalidation-kind'

export interface WorkStore {
  readonly isStaticGeneration: boolean

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
  readonly cacheLifeProfiles?: { [profile: string]: CacheLife }
  readonly useCacheTimeout: number
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
  }>

  /**
   * Tags that were previously revalidated (e.g. by a redirecting server action)
   * and have already been sent to cache handlers. Retrieved cache entries that
   * include any of these tags must be discarded.
   */
  readonly previouslyRevalidatedTags: readonly string[]

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
