import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { RenderOpts } from '../app-render/types'
import type { FetchMetric } from '../base-http'
import type { RequestLifecycleOpts } from '../base-server'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'
import type { CacheLife } from '../use-cache/cache-life'

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
    cacheLifeProfiles?: { [profile: string]: CacheLife }
    incrementalCache?: IncrementalCache
    isOnDemandRevalidate?: boolean
    cacheComponents: boolean
    fetchCache?: AppSegmentConfig['fetchCache']
    isPossibleServerAction?: boolean
    pendingWaitUntil?: Promise<any>
    experimental: Pick<
      RenderOpts['experimental'],
      'isRoutePPREnabled' | 'authInterrupts'
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
    | 'supportsDynamicResponse'
    | 'shouldWaitOnAllReady'
    | 'nextExport'
    | 'isDraftMode'
    | 'isDebugDynamicAccesses'
    | 'dev'
    | 'hasReadableErrorStacks'
  > &
    RequestLifecycleOpts &
    Partial<Pick<RenderOpts, 'reactLoadableManifest'>>

  /**
   * The build ID of the current build.
   */
  buildId: string

  // Tags that were previously revalidated (e.g. by a redirecting server action)
  // and have already been sent to cache handlers.
  previouslyRevalidatedTags: string[]
}

export function createWorkStore({
  page,
  renderOpts,
  isPrefetchRequest,
  buildId,
  previouslyRevalidatedTags,
  nonce,
}: WorkStoreContext): WorkStore {
  /**
   * Rules of Static & Dynamic HTML:
   *
   *    1.) We must generate static HTML unless the caller explicitly opts
   *        in to dynamic HTML support.
   *
   *    2.) If dynamic HTML support is requested, we must honor that request
   *        or throw an error. It is the sole responsibility of the caller to
   *        ensure they aren't e.g. requesting dynamic HTML for a static page.
   *
   *    3.) If the request is in draft mode, we must generate dynamic HTML.
   *
   *    4.) If the request is a server action, we must generate dynamic HTML.
   *
   * These rules help ensure that other existing features like request caching,
   * coalescing, and ISR continue working as intended.
   */
  const isStaticGeneration =
    !renderOpts.shouldWaitOnAllReady &&
    !renderOpts.supportsDynamicResponse &&
    !renderOpts.isDraftMode &&
    !renderOpts.isPossibleServerAction

  const isDevelopment = renderOpts.dev ?? false

  const shouldTrackFetchMetrics =
    isDevelopment ||
    // The only times we want to track fetch metrics outside of development is
    // when we are performing a static generation and we either are in debug
    // mode, or tracking fetch metrics was specifically opted into.
    (isStaticGeneration &&
      (!!process.env.NEXT_DEBUG_BUILD ||
        process.env.NEXT_SSG_FETCH_METRICS === '1'))

  const store: WorkStore = {
    isStaticGeneration,
    page,
    route: normalizeAppPath(page),
    incrementalCache:
      // we fallback to a global incremental cache for edge-runtime locally
      // so that it can access the fs cache without mocks
      renderOpts.incrementalCache || (globalThis as any).__incrementalCache,
    cacheLifeProfiles: renderOpts.cacheLifeProfiles,
    isBuildTimePrerendering: renderOpts.nextExport,
    hasReadableErrorStacks: renderOpts.hasReadableErrorStacks,
    fetchCache: renderOpts.fetchCache,
    isOnDemandRevalidate: renderOpts.isOnDemandRevalidate,

    isDraftMode: renderOpts.isDraftMode,

    isPrefetchRequest,
    buildId,
    reactLoadableManifest: renderOpts?.reactLoadableManifest || {},
    assetPrefix: renderOpts?.assetPrefix || '',
    nonce,

    afterContext: createAfterContext(renderOpts),
    cacheComponentsEnabled: renderOpts.cacheComponents,
    dev: isDevelopment,
    previouslyRevalidatedTags,
    refreshTagsByCacheKind: createRefreshTagsByCacheKind(),
    runInCleanSnapshot: createSnapshot(),
    shouldTrackFetchMetrics,
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
