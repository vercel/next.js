import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import { InvariantError } from '../../shared/lib/invariant-error'

/**
 * Marks a cache stage boundary. Content after `await unstable_navigation()` is
 * still cacheable but excluded from default runtime prefetches, reducing server
 * cost per prefetch.
 *
 * Inside `"use cache"`: sets a flag on the cache entry so that the
 * `use-cache-wrapper` returns a hanging promise for runtime prefetches.
 *
 * Outside `"use cache"` (bare server component): directly returns a hanging
 * promise during runtime prefetch.
 */
export function unstable_navigation(): Promise<void> {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      '`unstable_navigation()` is only available with the `cacheComponents` config.'
    )
  }

  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workUnitStore) {
    throw new Error(
      '`unstable_navigation()` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context'
    )
  }

  switch (workUnitStore.type) {
    case 'cache':
    case 'private-cache':
      // Inside "use cache": flag the cache entry so the wrapper can omit it
      // from runtime prefetches.
      workUnitStore.hasMaxPrefetch = false
      return Promise.resolve()

    case 'request':
      // Real navigation or cached navigation — resolve immediately.
      return Promise.resolve()

    case 'prerender-runtime':
      // Runtime prefetch — suspend forever (until the render signal aborts).
      return makeHangingPromise(
        workUnitStore.renderSignal,
        workStore?.route ?? '',
        '`unstable_navigation()`'
      )

    case 'prerender':
    case 'prerender-ppr':
    case 'prerender-client':
    case 'prerender-legacy':
      // Static builds are unaffected.
      return Promise.resolve()

    case 'unstable-cache':
      throw new Error(
        '`unstable_navigation()` cannot be called inside `unstable_cache()`.'
      )

    case 'generate-static-params':
      throw new Error(
        '`unstable_navigation()` cannot be called inside `generateStaticParams()`.'
      )

    case 'validation-client': {
      const exportName = '`unstable_navigation`'
      throw new InvariantError(
        `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
      )
    }

    default: {
      workUnitStore satisfies never
      throw new InvariantError('Unexpected work unit store type.')
    }
  }
}

// Also export as `navigation` for internal use / future stable API.
export { unstable_navigation as navigation }
