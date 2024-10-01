import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'
import {
  isDynamicIOPrerender,
  prerenderAsyncStorage,
} from '../app-render/prerender-async-storage.external'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { makeHangingPromise } from '../dynamic-rendering-utils'

/**
 * This function allows you to indicate that you require an actual user Request before continuing.
 *
 * During prerendering it will never resolve and during rendering it resolves immediately.
 */
export function connection(): Promise<void> {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()
  const prerenderStore = prerenderAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // headers object without tracking
      return Promise.resolve(undefined)
    }

    if (staticGenerationStore.isUnstableCacheCallback) {
      throw new Error(
        `Route ${staticGenerationStore.route} used "connection" inside a function cached with "unstable_cache(...)". The \`connection()\` function is used to indicate the subsequent code must only run when there is an actual Request, but caches must be able to be produced before a Request so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    } else if (staticGenerationStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${staticGenerationStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (prerenderStore) {
      // We are in PPR and/or dynamicIO mode and prerendering

      if (isDynamicIOPrerender(prerenderStore)) {
        // We use the controller and cacheSignal as an indication we are in dynamicIO mode.
        // When resolving headers for a prerender with dynamic IO we return a forever promise
        // along with property access tracked synchronous headers.

        // We don't track dynamic access here because access will be tracked when you access
        // one of the properties of the headers object.
        return makeHangingPromise()
      } else {
        // We are prerendering with PPR. We need track dynamic access here eagerly
        // to keep continuity with how headers has worked in PPR without dynamicIO.
        // TODO consider switching the semantic to throw on property access intead
        postponeWithTracking(
          staticGenerationStore.route,
          'connection',
          prerenderStore.dynamicTracking
        )
      }
    } else if (staticGenerationStore.isStaticGeneration) {
      // We are in a legacy static generation mode while prerendering
      // We treat this function call as a bailout of static generation
      throwToInterruptStaticGeneration('connection', staticGenerationStore)
    }
    // We fall through to the dynamic context below but we still track dynamic access
    // because in dev we can still error for things like using headers inside a cache context
    trackDynamicDataInDynamicRender(staticGenerationStore)
  }

  return Promise.resolve(undefined)
}
