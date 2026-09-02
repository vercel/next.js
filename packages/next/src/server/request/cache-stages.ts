import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import {
  applyOwnerStack,
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
      `Route ${workStore.route} used \`unstable_prefetch()\`, which requires Cache Components to be enabled. Learn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
    )
  }

  if (!isRequestApiAllowedInCurrentPhase(workUnitStore)) {
    throw new Error(
      `Route ${workStore.route} used \`unstable_prefetch()\` inside \`after()\` while rendering. The \`unstable_prefetch()\` function is used to indicate the subsequent code must not run in the app shell, but \`after()\` executes after the request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
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
      // `Runtime`. It'll resolve in a runtime prefetch, and in a runtime
      // prerender produced during a navigation.
      // Note that this does not mark the subtree as dynamic -- content guarded by
      // prefetch() is still considered cacheable.
      const { stagedRendering } = workUnitStore
      const prefetchStage = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
      if (!stagedRendering) {
        // Prospective prerender
        // Make sure we don't unblock content that won't be reached in the final prerender.
        if (workUnitStore.finalStage < prefetchStage) {
          return makeUntrackedHangingPromise(
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
        trackIncompatibleShellContent(workUnitStore)
        const stage = workUnitStore.needsAppShell
          ? RENDER_STAGES_BY_DATA_KIND.runtimeLinkData // Match the timing of 'prerender-runtime'.
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
        `Route ${workStore.route} used \`unstable_prefetch()\` inside "use cache". This is not currently supported. Instead, move the "use cache" directive to a function that's called below \`await unstable_prefetch()\`, so that the cached content is deferred to the prefetch without caching the stage boundary itself. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_prefetch)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'private-cache': {
      const error = new Error(
        `Route ${workStore.route} used \`unstable_prefetch()\` inside "use cache: private". This is not currently supported. Instead, move the "use cache" directive to a function that's called below \`await unstable_prefetch()\`, so that the cached content is deferred to the prefetch without caching the stage boundary itself. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_prefetch)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'unstable-cache': {
      throw new Error(
        `Route ${workStore.route} used \`unstable_prefetch()\` inside a function cached with \`unstable_cache()\`. The \`unstable_prefetch()\` function is used to indicate the subsequent code must not run in the app shell, but \`unstable_cache()\` caches must be able to be produced before a prefetch, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route ${workStore.route} used \`unstable_prefetch()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without a prefetch. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
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
        `Route ${workStore.route} used \`unstable_prefetch()\`, which requires Cache Components to be enabled. Learn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
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
      `Route ${workStore.route} used \`unstable_navigation()\`, which requires Cache Components to be enabled. Learn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
    )
  }

  if (!isRequestApiAllowedInCurrentPhase(workUnitStore)) {
    throw new Error(
      `Route ${workStore.route} used \`unstable_navigation()\` inside \`after()\` while rendering. The \`unstable_navigation()\` function is used to indicate the subsequent code must only run during an actual navigation, but \`after()\` executes after the request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
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
        trackIncompatibleShellContent(workUnitStore)
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
        `Route ${workStore.route} used \`unstable_navigation()\` inside "use cache". This is not currently supported. Instead, move the "use cache" directive to a function that's called below \`await unstable_navigation()\`, so that the cached content is deferred to the navigation without caching the stage boundary itself. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_navigation)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'private-cache': {
      const error = new Error(
        `Route ${workStore.route} used \`unstable_navigation()\` inside "use cache: private". This is not currently supported. Instead, move the "use cache" directive to a function that's called below \`await unstable_navigation()\`, so that the cached content is deferred to the navigation without caching the stage boundary itself. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
      )
      Error.captureStackTrace(error, unstable_navigation)
      applyOwnerStack(error)
      workStore.invalidDynamicUsageError ??= error
      throw error
    }
    case 'unstable-cache': {
      throw new Error(
        `Route ${workStore.route} used \`unstable_navigation()\` inside a function cached with \`unstable_cache()\`. The \`unstable_navigation()\` function is used to indicate the subsequent code must only run during an actual navigation, but \`unstable_cache()\` caches must be able to be produced before a navigation, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    }
    case 'generate-static-params': {
      throw new Error(
        `Route ${workStore.route} used \`unstable_navigation()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without a navigation. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
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
        `Route ${workStore.route} used \`unstable_navigation()\`, which requires Cache Components to be enabled. Learn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
      )
    }

    default: {
      workUnitStore satisfies never
      return Promise.resolve(undefined)
    }
  }
}
