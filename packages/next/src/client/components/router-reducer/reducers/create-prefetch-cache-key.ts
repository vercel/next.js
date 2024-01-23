import type { FlightRouterState } from '../../../../server/app-render/types'
import { addPathPrefix } from '../../../../shared/lib/router/utils/add-path-prefix'
import { pathHasPrefix } from '../../../../shared/lib/router/utils/path-has-prefix'
import { createHrefFromUrl } from '../create-href-from-url'
import { createRouterCacheKey } from '../create-router-cache-key'

/**
 * Creates a cache key for the router prefetch cache
 *
 * @param url - The URL being navigated to
 * @param tree - The FlightRouterState, used to compute a cache key prefix for the current segment
 * @return The generated prefetch cache key.
 */
export function createPrefetchCacheKey(url: URL, tree: FlightRouterState) {
  const pathnameFromUrl = createHrefFromUrl(
    url,
    // Ensures the hash is not part of the cache key as it does not impact the server fetch
    false
  )

  // delimit the prefix so we don't conflict with other pages
  // grab the 'children' parallel route (aka, the current page/layout)
  // and use that as a cache prefix
  const segment = tree[1].children[0]
  const segmentKey = createRouterCacheKey(segment)

  // Route interception depends on `nextUrl` values which aren't a 1:1 mapping to a URL
  // The cache key that we store needs to use `nextUrl` to properly distinguish cache entries
  if (segment && !pathHasPrefix(pathnameFromUrl, segmentKey)) {
    return addPathPrefix(pathnameFromUrl, segmentKey)
  }

  return pathnameFromUrl
}
