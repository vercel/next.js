import { AsyncStorageWrapper } from './async-storage-wrapper'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import type { AsyncLocalStorage } from 'async_hooks'
import { IncrementalCache } from '../lib/incremental-cache'

export type RequestContext = {
  pathname: string
  renderOpts: {
    incrementalCache?: IncrementalCache
    supportsDynamicHTML: boolean
    isRevalidate?: boolean
    isBot?: boolean
  }
}

export class StaticGenerationAsyncStorageWrapper
  implements AsyncStorageWrapper<StaticGenerationStore, RequestContext>
{
  public wrap<Result>(
    storage: AsyncLocalStorage<StaticGenerationStore>,
    context: RequestContext,
    callback: () => Result
  ): Result {
    return StaticGenerationAsyncStorageWrapper.wrap(storage, context, callback)
  }

  /**
   * @deprecated instance method should be used in favor of the static method
   */
  public static wrap<Result>(
    storage: AsyncLocalStorage<StaticGenerationStore>,
    { pathname, renderOpts }: RequestContext,
    callback: () => Result
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
    }
    ;(renderOpts as any).store = store

    return storage.run(store, callback)
  }
}
