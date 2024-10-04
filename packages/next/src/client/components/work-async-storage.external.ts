import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import type { DynamicServerError } from './hooks-server-context'
import type { FetchMetrics } from '../../server/base-http'
import type { Revalidate } from '../../server/lib/revalidate'
import type { FallbackRouteParams } from '../../server/request/fallback-params'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

// Share the instance module in the next-shared layer
import { workAsyncStorage } from './work-async-storage-instance' with { 'turbopack-transition': 'next-shared' }
import type { AppSegmentConfig } from '../../build/app-segments/app-segment-config'

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

  /**
   * The set of unknown route parameters. Accessing these will be tracked as
   * a dynamic access.
   */
  readonly fallbackRouteParams: FallbackRouteParams | null

  readonly incrementalCache?: IncrementalCache
  readonly isOnDemandRevalidate?: boolean
  readonly isPrerendering?: boolean
  readonly isRevalidate?: boolean

  forceDynamic?: boolean
  fetchCache?: AppSegmentConfig['fetchCache']

  revalidate?: Revalidate
  forceStatic?: boolean
  dynamicShouldError?: boolean
  pendingRevalidates?: Record<string, Promise<any>>
  pendingRevalidateWrites?: Array<Promise<void>> // This is like pendingRevalidates but isn't used for deduping.

  dynamicUsageDescription?: string
  dynamicUsageStack?: string
  dynamicUsageErr?: DynamicServerError

  nextFetchId?: number
  pathWasRevalidated?: boolean

  tags?: string[]

  revalidatedTags?: string[]
  fetchMetrics?: FetchMetrics

  isDraftMode?: boolean
  isUnstableNoStore?: boolean
  isPrefetchRequest?: boolean

  requestEndedState?: { ended?: boolean }

  buildId: string

  readonly reactLoadableManifest?: DeepReadonly<
    Record<string, { files: string[] }>
  >
  readonly assetPrefix?: string
}

export type WorkAsyncStorage = AsyncLocalStorage<WorkStore>

export { workAsyncStorage }
