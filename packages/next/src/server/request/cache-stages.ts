import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import {
  applyOwnerStack,
  makePrefetchHangingPromise,
  makeUntrackedHangingPromise,
  RENDER_STAGES_BY_DATA_KIND,
  trackIncompatibleShellContent,
} from '../dynamic-rendering-utils'
import { isRequestApiAllowedInCurrentPhase } from './utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import { RenderStage } from '../app-render/staged-rendering'

/**
 * When `partialPrefetching` is enabled, this function allows you to indicate
 * that the subsequent code should be excluded from the shell. It will be deferred until
 * a prefetch (i.e. when using `<Link prefetch={true}>`) or a navigation.
 *
 * It has no effect during static prerendering — static output is computed
 * once and shared across many clients, so there's no per-request cost to
 * save — and no effect on the initial load of a page.
 *
 * Unlike `connection()`, it does not mark the subtree as request-dependent —
 * content below `await unstable_prefetch()` remains fully cacheable.
 */
export function unstable_prefetch(): Promise<void> {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore || !workUnitStore) {
    const callingExpression = 'unstable_prefetch'
    throwForMissingRequestStore(callingExpression)
  }
  if (!process.env.__NEXT_CACHE_COMPONENTS) {
    throw new Error(
      `Route "${workStore.route}": \`unstable_prefetch()\` requires Cache Components.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/prefetch`
    )
  }

  if (!isRequestApiAllowedInCurrentPhase(workUnitStore)) {
    throw new Error(
      `Route "${workStore.route}": \`unstable_prefetch()\` can't be called inside \`after()\` because \`after()\` runs after the request.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/after`
    )
  }

  switch (workUnitStore.type) {
    case 'prerender': {
      // Content below `prefetch()` is excluded from the shell, but it's
      // deliberately included in the static output (and thus in static
      // prefetches), so we only delay it until the static prefetch stage.
      const { stagedRendering } = workUnitStore
      if (!stagedRendering) {
        // Prospective prerender
        // `unstable_prefetch()` will resolve in the final prerender, so resolve it here as well.
        return Promise.resolve(undefined)
      } else {
        // Final prerender
        return stagedRendering.delayUntilStage(
          RENDER_STAGES_BY_DATA_KIND.staticLinkData,
          'unstable_prefetch',
          undefined
        )
      }
    }
    case 'prerender-runtime': {
      // In a shell render, prefetch() doesn't resolve, because it doesn't reach
      // `PrefetchRuntime`. It'll resolve in a runtime prefetch, and in a
      // runtime prerender produced during a navigation.
      // Note that this does not mark the subtree as dynamic -- content guarded by
      // prefetch() is still considered cacheable.
      const { stagedRendering } = workUnitStore
      const prefetchStage = RENDER_STAGES_BY_DATA_KIND.runtimePrefetchData
      if (!stagedRendering) {
        // Prospective prerender
        // Make sure we don't unblock content that won't be reached in the final prerender.
        if (workUnitStore.finalStage < prefetchStage) {
          return makePrefetchHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            '`unstable_prefetch()`'
          )
        } else {
          return Promise.resolve(undefined)
        }
      } else {
        // Final prerender
        return stagedRendering.delayUntilStage(
          prefetchStage,
          'unstable_prefetch',
          undefined
        )
      }
    }
    case 'request': {
      const { stagedRendering } = workUnitStore
      if (stagedRendering) {
        // We can either recover a static shell or a runtime shell, but not both.
        trackIncompatibleShellContent(workUnitStore, '`unstable_prefetch()`')
        const stage = workUnitStore.needsAppShell
          ? RENDER_STAGES_BY_DATA_KIND.runtimePrefetchData // Match the timing of 'prerender-runtime'.
          : RENDER_STAGES_BY_DATA_KIND.staticLinkData // Match the timing of 'prerender'.

        return stagedRendering.delayUntilStage(
          stage,
          'unstable_prefetch',
          undefined
        )
      }
      return Promise.resolve(undefined)
    }

    case 'cache': {
      const error = new Error(
        `Route "${workStore.route}": \`unstable_prefetch()\` can't be called inside \`"use cache"\`. Move \`await unstable_prefetch()\` outside the cached function, then call the cached function below it.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_prefetch)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'private-cache': {
      const error = new Error(
        `Route "${workStore.route}": \`unstable_prefetch()\` can't be called inside \`"use cache: private"\`. Move \`await unstable_prefetch()\` outside the cached function, then call the cached function below it.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_prefetch)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'unstable-cache': {
      throw new Error(
        `Route "${workStore.route}": \`unstable_prefetch()\` can't be called inside \`unstable_cache()\`. Call it outside the cached function.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route "${workStore.route}": \`unstable_prefetch()\` can't be called inside \`generateStaticParams\` because it runs at build time, without a prefetch.\nLearn more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
      )
    }
    case 'prerender-client':
    case 'validation-client': {
      const exportName = '`unstable_prefetch`'
      throw new InvariantError(
        `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
      )
    }
    case 'prerender-legacy': {
      // NOTE: Should not be reachable, because we don't use this mode in cacheComponents,
      // which we require at the top
      throw new Error(
        `Route "${workStore.route}": \`unstable_prefetch()\` requires Cache Components.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/prefetch`
      )
    }

    default: {
      workUnitStore satisfies never
      return Promise.resolve(undefined)
    }
  }
}

/**
 * This function allows you to indicate that the subsequent code should be
 * deferred to the actual navigation instead of rendering during a runtime
 * prefetch. Runtime prefetches are rendered per-user, per-link, so deferring
 * content below `await unstable_navigation()` saves that per-request
 * rendering cost.
 *
 * It has no effect during static prerendering — static output is computed
 * once and shared across many clients, so there's no per-request cost to
 * save — and no effect on the initial load of a page.
 *
 * Unlike `connection()`, it does not mark the subtree as request-dependent —
 * content below `await unstable_navigation()` remains fully cacheable.
 */
export function unstable_navigation(): Promise<void> {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workStore || !workUnitStore) {
    const callingExpression = 'unstable_navigation'
    throwForMissingRequestStore(callingExpression)
  }
  if (!process.env.__NEXT_CACHE_COMPONENTS) {
    throw new Error(
      `Route "${workStore.route}": \`unstable_navigation()\` requires Cache Components.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/navigation`
    )
  }

  if (!isRequestApiAllowedInCurrentPhase(workUnitStore)) {
    throw new Error(
      `Route "${workStore.route}": \`unstable_navigation()\` can't be called inside \`after()\` because \`after()\` runs after the request.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/after`
    )
  }

  switch (workUnitStore.type) {
    case 'prerender': {
      // Static prerenders are computed once and shared across many
      // clients, so there's no per-request prefetch cost to save by
      // deferring the content — it's deliberately included in the static
      // output (and thus in static prefetches).
      // However, it's excluded from the shell, and has to be separated from
      // unstable_prefetch(), so we have to delay it.
      const { stagedRendering } = workUnitStore
      if (!stagedRendering) {
        // Prospective prerender
        // `unstable_navigation()` will resolve in the final prerender, so resolve it here as well.
        return Promise.resolve(undefined)
      } else {
        // Final prerender
        return stagedRendering.delayUntilStage(
          RenderStage.NavigationStatic,
          'unstable_navigation',
          undefined
        )
      }
    }
    case 'prerender-runtime': {
      // In a shell or runtime prefetch, navigation() doesn't resolve,
      // because they don't reach `NavigationRuntime`.
      // It'll only resolve in a runtime prerender produced during a navigation.
      // Note that this does not mark the subtree as dynamic -- content guarded by
      // navigation() is still considered cacheable.
      const { stagedRendering } = workUnitStore
      const navigationStage = RenderStage.NavigationRuntime
      if (!stagedRendering) {
        // Prospective prerender
        // Make sure we don't unblock content that won't be reached in the final prerender.
        if (workUnitStore.finalStage < navigationStage) {
          return makeUntrackedHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            '`unstable_navigation()`'
          )
        } else {
          return Promise.resolve(undefined)
        }
      } else {
        // Final prerender
        return stagedRendering.delayUntilStage(
          navigationStage,
          'unstable_navigation',
          undefined
        )
      }
    }
    case 'request': {
      const { stagedRendering } = workUnitStore
      if (stagedRendering) {
        // We can either recover a static shell or a runtime shell, but not both.
        trackIncompatibleShellContent(workUnitStore, '`unstable_navigation()`')
        const stage = workUnitStore.needsAppShell
          ? RenderStage.NavigationRuntime // Match the timing of 'prerender-runtime'.
          : RenderStage.NavigationStatic // Match the timing of 'prerender'.

        return stagedRendering.delayUntilStage(
          stage,
          'unstable_navigation',
          undefined
        )
      }
      return Promise.resolve(undefined)
    }

    case 'cache': {
      const error = new Error(
        `Route "${workStore.route}": \`unstable_navigation()\` can't be called inside \`"use cache"\`. Move \`await unstable_navigation()\` outside the cached function, then call the cached function below it.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_navigation)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'private-cache': {
      const error = new Error(
        `Route "${workStore.route}": \`unstable_navigation()\` can't be called inside \`"use cache: private"\`. Move \`await unstable_navigation()\` outside the cached function, then call the cached function below it.\nLearn more: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_navigation)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'unstable-cache': {
      throw new Error(
        `Route "${workStore.route}": \`unstable_navigation()\` can't be called inside \`unstable_cache()\`. Call it outside the cached function.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route "${workStore.route}": \`unstable_navigation()\` can't be called inside \`generateStaticParams\` because it runs at build time, without a navigation.\nLearn more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
      )
    }
    case 'prerender-client':
    case 'validation-client': {
      const exportName = '`unstable_navigation`'
      throw new InvariantError(
        `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
      )
    }
    case 'prerender-legacy': {
      // NOTE: Should not be reachable, because we don't use this mode in cacheComponents,
      // which we require at the top
      throw new Error(
        `Route "${workStore.route}": \`unstable_navigation()\` requires Cache Components.\nLearn more: https://nextjs.org/docs/app/api-reference/functions/navigation`
      )
    }

    default: {
      workUnitStore satisfies never
      return Promise.resolve(undefined)
    }
  }
}
