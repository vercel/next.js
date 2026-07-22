import { workAsyncStorage } from '../app-render/work-async-storage.external'
import {
  checkAndRecordStageDeferral,
  throwForMissingRequestStore,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import { RenderStage } from '../app-render/staged-rendering'
import {
  applyOwnerStack,
  makeStageHangingPromise,
} from '../dynamic-rendering-utils'
import { isRequestApiAllowedInCurrentPhase } from './utils'
import { InvariantError } from '../../shared/lib/invariant-error'

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
  const callingExpression = 'unstable_navigation'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    if (workUnitStore && !isRequestApiAllowedInCurrentPhase(workUnitStore)) {
      throw new Error(
        `Route ${workStore.route} used \`unstable_navigation()\` inside \`after()\` while rendering. The \`unstable_navigation()\` function is used to indicate the subsequent code must only run during an actual navigation, but \`after()\` executes after the request, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic, we override all other logic and always just
      // return a resolving promise without tracking. This matches the behavior
      // of connection().
      return Promise.resolve(undefined)
    }

    // Note: unlike connection(), we deliberately do NOT throw for
    // `dynamic = "error"`. unstable_navigation() does not make anything
    // dynamic; a page that uses it can still be fully static — the content
    // below it is merely excluded from runtime prefetches.

    if (workUnitStore) {
      switch (workUnitStore.type) {
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
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used \`unstable_navigation()\` inside a function cached with \`unstable_cache()\`. The \`unstable_navigation()\` function is used to indicate the subsequent code must only run during an actual navigation, but \`unstable_cache()\` caches must be able to be produced before a navigation, so this function is not allowed in this scope. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'generate-static-params':
          throw new Error(
            `Route ${workStore.route} used \`unstable_navigation()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without a navigation. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`
          )
        case 'prerender':
        case 'prerender-client':
          // unstable_navigation() is a no-op during static prerendering.
          // Static prerenders are computed once and shared across many
          // clients, so there's no per-request prefetch cost to save by
          // deferring the content — it's deliberately included in the static
          // output (and thus in static prefetches).
          return Promise.resolve(undefined)
        case 'prerender-runtime':
          // Runtime prefetches are rendered per-user, per-link, so this is
          // exactly the cost unstable_navigation() exists to save: we return
          // a promise that never resolves so the runtime prefetch stalls at
          // this point, and the content below is deferred to the actual
          // navigation. Note that this does not mark the subtree as dynamic —
          // the content below is still cacheable and is filled in during the
          // navigation.
          //
          // A navigation-depth runtime prefetch, however, is allowed to
          // render through the navigation gate (real dynamic APIs like
          // `connection()` still hang), so we resolve immediately in that
          // case.
          if (checkAndRecordStageDeferral(workUnitStore, RenderStage.Dynamic)) {
            return makeStageHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              '`unstable_navigation()`',
              workUnitStore
            )
          }
          return Promise.resolve(undefined)
        case 'validation-client': {
          // TODO(NAR-789): make this consistent with the actual browser behavior when we change it.
          // Until then, erroring is fine.
          const exportName = '`unstable_navigation`'
          throw new InvariantError(
            `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
          )
        }
        case 'prerender-ppr':
        case 'prerender-legacy':
          // unstable_navigation() relies on the staged rendering model, which
          // only exists with Cache Components.
          throw new Error(
            `Route ${workStore.route} used \`unstable_navigation()\`, which requires Cache Components to be enabled. Learn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents`
          )
        case 'request':
          // Invariant: an actual navigation or initial load never defers
          // content — in dev or prod. unstable_navigation() only defers
          // content out of runtime prefetches.
          // TODO: Track this access in dev so that instant validation can
          // model the content below `unstable_navigation()` being deferred
          // out of runtime prefetches.
          return Promise.resolve(undefined)
        default:
          workUnitStore satisfies never
      }
    }
  }

  // If we end up here, there was no work store or work unit store present.
  // Importing `unstable_navigation` from `next/cache` in client components is
  // a compile-time error, so this is only reachable from code that skips that
  // check (e.g. node_modules), where we error about a missing work unit store.
  throwForMissingRequestStore(callingExpression)
}
