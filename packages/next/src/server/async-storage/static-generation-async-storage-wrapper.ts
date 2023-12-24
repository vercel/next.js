import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'

export type StaticGenerationContext = {
  urlPathname: string
  postpone?: (reason: string) => never
  renderOpts: {
    originalPathname?: string
    incrementalCache?: IncrementalCache
    supportsDynamicHTML: boolean
    isRevalidate?: boolean
    isOnDemandRevalidate?: boolean
    isBot?: boolean
    nextExport?: boolean
    fetchCache?: StaticGenerationStore['fetchCache']
    isDraftMode?: boolean
    isServerAction?: boolean
    waitUntil?: Promise<any>
    experimental: { ppr: boolean }

    /**
     * A hack around accessing the store value outside the context of the
     * request.
     *
     * @internal
     * @deprecated should only be used as a temporary workaround
     */
    // TODO: remove this when we resolve accessing the store outside the execution context
    store?: StaticGenerationStore
  }
}

export const StaticGenerationAsyncStorageWrapper: AsyncStorageWrapper<
  StaticGenerationStore,
  StaticGenerationContext
> = {
  wrap<Result>(
    storage: AsyncLocalStorage<StaticGenerationStore>,
    { urlPathname, renderOpts, postpone }: StaticGenerationContext,
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

      postpone:
        // If we aren't performing a static generation or we aren't using PPR then
        // we don't need to postpone.
        isStaticGeneration && renderOpts.experimental.ppr && postpone
          ? (reason: string) => {
              // Keep track of if the postpone API has been called.
              store.postponeWasTriggered = true

              return postpone(
                `This page needs to bail out of prerendering at this point because it used ${reason}. ` +
                  `React throws this special object to indicate where. It should not be caught by ` +
                  `your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`
              )
            }
          : undefined,
    }

    // TODO: remove this when we resolve accessing the store outside the execution context
    renderOpts.store = store

    return storage.run(store, callback, store)
  },
}
