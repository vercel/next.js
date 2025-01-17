import type { FlightRouterState } from '../../../server/app-render/types'
import { createPrefetchURL } from '../../components/app-router'
import { createCacheKey } from './cache-key'
import { schedulePrefetchTask, PrefetchPriority } from './scheduler'

/**
 * Entrypoint for prefetching a URL into the Segment Cache.
 * @param href - The URL to prefetch. Typically this will come from a <Link>,
 * or router.prefetch. It must be validated before we attempt to prefetch it.
 * @param nextUrl - A special header used by the server for interception routes.
 * Roughly  corresponds to the current URL.
 * @param treeAtTimeOfPrefetch - The FlightRouterState at the time the prefetch
 * was requested. This is only used when PPR is disabled.
 * @param includeDynamicData - Whether to prefetch dynamic data, in addition to
 * static data. This is used by <Link prefetch={true}>.
 */
export function prefetch(
  href: string,
  nextUrl: string | null,
  treeAtTimeOfPrefetch: FlightRouterState,
  includeDynamicData: boolean
) {
  const url = createPrefetchURL(href)
  if (url === null) {
    // This href should not be prefetched.
    return
  }
  const cacheKey = createCacheKey(url.href, nextUrl)
  schedulePrefetchTask(
    cacheKey,
    treeAtTimeOfPrefetch,
    includeDynamicData,
    PrefetchPriority.Default
  )
}
