import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { RenderOpts } from '../app-render/types'
import type { FetchMetric } from '../base-http'
import type { RequestLifecycleOpts } from '../base-server'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'
import type {
  ValidationLevel,
  ResolvedCacheLifeProfiles,
} from '../config-shared'

import { AfterContext } from '../after/after-context'

import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { createLazyResult, type LazyResult } from '../lib/lazy-result'
import { getCacheHandlerEntries } from '../use-cache/handlers'
import { createSnapshot } from '../app-render/async-local-storage'

export type WorkStoreContext = {
  /**
   * The page that is being rendered. This relates to the path to the page file.
   */
  page: string

  isPrefetchRequest?: boolean
  nonce?: string
  renderOpts: {
    cacheLifeProfiles: ResolvedCacheLifeProfiles
    staticPageGenerationTimeout: number
    incrementalCache?: IncrementalCache
    /**
     * The hash of the most recent server component change (dev only). Included
     * in `"use cache"` cache keys so that cached entries are revalidated after
     * an edit, for every client, regardless of whether it runs the HMR client.
     */
    hmrRefreshHash?: string
    isOnDemandRevalidate?: boolean
    cacheComponents: boolean
    validationLevel: ValidationLevel
    fetchCache?: AppSegmentConfig['fetchCache']
    pendingWaitUntil?: Promise<any>
    experimental: Pick<
      RenderOpts['experimental'],
      | 'isRoutePPREnabled'
      | 'authInterrupts'
      | 'useCacheTimeout'
      | 'durableUseCacheEntries'
    >

    /**
     * Fetch metrics attached in patch-fetch.ts
     **/
    fetchMetrics?: FetchMetric[]

    /**
     * A hack around accessing the store value outside the context of the
     * request.
     *
     * @internal
     * @deprecated should only be used as a temporary workaround
     */
    // TODO: remove this when we resolve accessing the store outside the execution context
    store?: WorkStore
  } & Pick<
    // Pull some properties from RenderOpts so that the docs are also
    // mirrored.
    RenderOpts,
    | 'assetPrefix'
    | 'isBuildTimePrerendering'
    | 'isDraftMode'
    | 'isDebugDynamicAccesses'
  > &
    RequestLifecycleOpts &
    Partial<Pick<RenderOpts, 'reactLoadableManifest'>>

  /**
   * The deployment ID of the current build.
   */
  deploymentId: string

  /**
   * The build ID of the current build.
   */
  buildId: string

  // Tags that were previously revalidated (e.g. by a redirecting server action)
  // and have already been sent to cache handlers.
  previouslyRevalidatedTags: string[]
}

export function createWorkStore(context: WorkStoreContext): WorkStore {
  return createWorkStoreImpl(context, !!process.env.__NEXT_DEV_SERVER)
}

export function createPrerenderWorkStore(context: WorkStoreContext): WorkStore {
  return createWorkStoreImpl(
    context,
    !!process.env.__NEXT_DEV_SERVER ||
      !!process.env.NEXT_DEBUG_BUILD ||
      process.env.NEXT_SSG_FETCH_METRICS === '1'
  )
}

function createWorkStoreImpl(
  {
    page,
    renderOpts,
    isPrefetchRequest,
    buildId,
    deploymentId,
    previouslyRevalidatedTags,
    nonce,
  }: WorkStoreContext,
  shouldTrackFetchMetrics: boolean
): WorkStore {
  const store: WorkStore = {
    page,
    route: normalizeAppPath(page),
    incrementalCache:
      // we fallback to a global incremental cache for edge-runtime locally
      // so that it can access the fs cache without mocks
      renderOpts.incrementalCache || (globalThis as any).__incrementalCache,
    cacheLifeProfiles: renderOpts.cacheLifeProfiles,
    useCacheTimeout: renderOpts.experimental.useCacheTimeout,
    durableUseCacheEntries: renderOpts.experimental.durableUseCacheEntries,
    staticPageGenerationTimeout: renderOpts.staticPageGenerationTimeout,
    isBuildTimePrerendering: renderOpts.isBuildTimePrerendering,
    fetchCache: renderOpts.fetchCache,
    isOnDemandRevalidate: renderOpts.isOnDemandRevalidate,
    requestId: undefined,
    htmlRequestId: undefined,

    isDraftMode: renderOpts.isDraftMode,

    isPrefetchRequest,
    buildId,
    deploymentId,
    reactLoadableManifest: renderOpts?.reactLoadableManifest || {},
    assetPrefix: renderOpts?.assetPrefix || '',
    nonce,

    afterContext: createAfterContext(renderOpts),
    cacheComponentsEnabled: renderOpts.cacheComponents,
    validationLevel: renderOpts.validationLevel,
    previouslyRevalidatedTags,
    requestStartTime: performance.timeOrigin + performance.now(),
    refreshTagsByCacheKind: createRefreshTagsByCacheKind(),
    runInCleanSnapshot: createSnapshot(),
    shouldTrackFetchMetrics,
    reactServerErrorsByDigest: new Map(),
  }

  // TODO: remove this when we resolve accessing the store outside the execution context
  renderOpts.store = store

  return store
}

function createAfterContext(renderOpts: RequestLifecycleOpts): AfterContext {
  const { waitUntil, onClose, onAfterTaskError } = renderOpts
  return new AfterContext({
    waitUntil,
    onClose,
    onTaskError: onAfterTaskError,
  })
}

/**
 * Creates a map with lazy results that refresh tags for the respective cache
 * kind when they're awaited for the first time.
 */
function createRefreshTagsByCacheKind(): Map<string, LazyResult<void>> {
  const refreshTagsByCacheKind = new Map<string, LazyResult<void>>()
  const cacheHandlers = getCacheHandlerEntries()

  if (cacheHandlers) {
    for (const [kind, cacheHandler] of cacheHandlers) {
      if ('refreshTags' in cacheHandler) {
        refreshTagsByCacheKind.set(
          kind,
          createLazyResult(async () => cacheHandler.refreshTags())
        )
      }
    }
  }

  return refreshTagsByCacheKind
}
