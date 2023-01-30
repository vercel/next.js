import { AsyncStorageWrapper } from './async-storage-wrapper'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage'
import type { RenderOpts } from '../app-render'
import type { AsyncLocalStorage } from 'async_hooks'

export type RequestContext = {
  pathname: string
  renderOpts: RenderOpts
}

export class StaticGenerationAsyncStorageWrapper
  implements AsyncStorageWrapper<StaticGenerationStore, RequestContext>
{
  wrap<Result>(
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
      renderOpts.supportsDynamicHTML !== true && !renderOpts.isBot

    const store: StaticGenerationStore = {
      isStaticGeneration,
      pathname,
      incrementalCache: renderOpts.incrementalCache,
      isRevalidate: renderOpts.isRevalidate,
    }

    return storage.run(store, callback)
  }
}
