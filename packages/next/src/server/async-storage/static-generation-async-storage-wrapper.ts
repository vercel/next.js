import type { AsyncStorageWrapper } from './async-storage-wrapper'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../lib/incremental-cache'

export type StaticGenerationContext = {
  pathname: string
  renderOpts: {
    incrementalCache?: IncrementalCache
    supportsDynamicHTML: boolean
    isRevalidate?: boolean
    isOnDemandRevalidate?: boolean
    isBot?: boolean
    nextExport?: boolean
    fetchCache?: StaticGenerationStore['fetchCache']

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
    { pathname, renderOpts }: StaticGenerationContext,
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
     * These rules help ensure that other existing features like request caching,
     * coalescing, and ISR continue working as intended.
     */
    const isStaticGeneration =
      !renderOpts.supportsDynamicHTML && !renderOpts.isBot

    const store: StaticGenerationStore = {
      isStaticGeneration,
      pathname,
      incrementalCache: renderOpts.incrementalCache,
      isRevalidate: renderOpts.isRevalidate,
      isPrerendering: renderOpts.nextExport,
      fetchCache: renderOpts.fetchCache,
      isOnDemandRevalidate: renderOpts.isOnDemandRevalidate,
    }

    // TODO: remove this when we resolve accessing the store outside the execution context
    renderOpts.store = store

    return storage.run(store, callback, store)
  },
}
