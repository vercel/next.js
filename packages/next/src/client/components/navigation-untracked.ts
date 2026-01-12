import { useContext } from 'react'
import { PathnameContext } from '../../shared/lib/hooks-client-context.shared-runtime'

/**
 * This checks to see if the current render has any unknown route parameters that
 * would cause the pathname to be dynamic. It's used to trigger a different
 * render path in the error boundary.
 *
 * @returns true if there are any unknown route parameters, false otherwise
 */
function hasFallbackRouteParams(): boolean {
  if (typeof window === 'undefined') {
    // AsyncLocalStorage should not be included in the client bundle.
    const { workUnitAsyncStorage } =
      require('../../server/app-render/work-unit-async-storage.external') as typeof import('../../server/app-render/work-unit-async-storage.external')

    const workUnitStore = workUnitAsyncStorage.getStore()
    if (!workUnitStore) return false

    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
        const fallbackParams = workUnitStore.fallbackRouteParams
        return fallbackParams ? fallbackParams.size > 0 : false
      case 'prerender-legacy':
      case 'request':
      case 'prerender-runtime':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }

    return false
  }

  return false
}

/**
 * This returns a `null` value if there are any unknown route parameters, and
 * otherwise returns the pathname from the context. This is an alternative to
 * `usePathname` that is used in the error boundary to avoid rendering the
 * error boundary when there are unknown route parameters. This doesn't throw
 * when accessed with unknown route parameters.
 *
 * @returns
 *
 * @internal
 */
export function useUntrackedPathname(): string | null {
  // If there are any unknown route parameters we would typically throw
  // an error, but this internal method allows us to return a null value instead
  // for components that do not propagate the pathname to the static shell (like
  // the error boundary).
  if (hasFallbackRouteParams()) {
    return null
  }

  // This shouldn't cause any issues related to conditional rendering because
  // the environment will be consistent for the render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(PathnameContext)
}
