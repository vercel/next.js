import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'
import type { RenderOptsPartial } from '../app-render/types'

import { createPrerenderState } from '../../server/app-render/dynamic-rendering'
import type { FetchMetric } from '../base-http'

export type StaticGenerationContext = {
  urlPathname: string
  requestEndedState?: { ended?: boolean }
  renderOpts: {
    incrementalCache?: IncrementalCache
    isOnDemandRevalidate?: boolean
    fetchCache?: StaticGenerationStore['fetchCache']
    isServerAction?: boolean
    pendingWaitUntil?: Promise<any>
    experimental: Pick<
      RenderOptsPartial['experimental'],
      'isRoutePPREnabled' | 'after'
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
    store?: StaticGenerationStore
  } & Pick<
    // Pull some properties from RenderOptsPartial so that the docs are also
    // mirrored.
    RenderOptsPartial,
    | 'originalPathname'
    | 'supportsDynamicHTML'
    | 'isRevalidate'
    | 'nextExport'
    | 'isDraftMode'
    | 'isDebugPPRSkeleton'
  >
}

export const StaticGenerationAsyncStorageWrapper: AsyncStorageWrapper<
  StaticGenerationStore,
  StaticGenerationContext
> = {
  wrap<Result>(
    storage: AsyncLocalStorage<StaticGenerationStore>,
    { urlPathname, renderOpts, requestEndedState }: StaticGenerationContext,
    callback: (store: StaticGenerationStore) => Result
  ): Result {
    /**
     * Rules of Static & Dynamic HTML:
     *
     *    1.) We must generate static HTML unless the caller explicitly opts
     *        in to dynamic HTML support.
     *
     *    2.) If dynamic HTML support is requested, we must honor that request
     *        or throw an error. It is the sole responsibility of the caller to
     *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
     *
     *    3.) If the request is in draft mode, we must generate dynamic HTML.
     *
     *    4.) If the request is a server action, we must generate dynamic HTML.
     *
     * These rules help ensure that other existing features like request caching,
     * coalescing, and ISR continue working as intended.
     */
    const isStaticGeneration =
      !renderOpts.supportsDynamicHTML &&
      !renderOpts.isDraftMode &&
      !renderOpts.isServerAction

    const prerenderState: StaticGenerationStore['prerenderState'] =
      isStaticGeneration && renderOpts.experimental?.isRoutePPREnabled
        ? createPrerenderState(renderOpts.isDebugPPRSkeleton)
        : null

    const store: StaticGenerationStore = {
      isStaticGeneration,
      urlPathname,
      pagePath: renderOpts.originalPathname,
      incrementalCache:
        // we fallback to a global incremental cache for edge-runtime locally
        // so that it can access the fs cache without mocks
        renderOpts.incrementalCache || (globalThis as any).__incrementalCache,
      isRevalidate: renderOpts.isRevalidate,
      isPrerendering: renderOpts.nextExport,
      fetchCache: renderOpts.fetchCache,
      isOnDemandRevalidate: renderOpts.isOnDemandRevalidate,

      isDraftMode: renderOpts.isDraftMode,

      prerenderState,
      requestEndedState,
    }

    // TODO: remove this when we resolve accessing the store outside the execution context
    renderOpts.store = store

    return storage.run(store, callback, store)
  },
}
