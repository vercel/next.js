import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import { createPrefetchURL } from '../app-router-utils'
import { createCacheKey } from './cache-key'
import { schedulePrefetchTask } from './scheduler'
import {
  PrefetchPriority,
  type PrefetchTaskFetchStrategy,
} from '../segment-cache'

/**
 * Entrypoint for prefetching a URL into the Segment Cache.
 * @param href - The URL to prefetch. Typically this will come from a <Link>,
 * or router.prefetch. It must be validated before we attempt to prefetch it.
 * @param nextUrl - A special header used by the server for interception routes.
 * Roughly corresponds to the current URL.
 * @param treeAtTimeOfPrefetch - The FlightRouterState at the time the prefetch
 * was requested. This is only used when PPR is disabled.
 * @param fetchStrategy - Whether to prefetch dynamic data, in addition to
 * static data. This is used by `<Link prefetch={true}>`.
 * @param onInvalidate - A callback that will be called when the prefetch cache
 * When called, it signals to the listener that the data associated with the
 * prefetch may have been invalidated from the cache. This is not a live
 * subscription — it's called at most once per `prefetch` call. The only
 * supported use case is to trigger a new prefetch inside the listener, if
 * desired. It also may be called even in cases where the associated data is
 * still cached. Prefetching is a poll-based (pull) operation, not an event-
 * based (push) one. Rather than subscribe to specific cache entries, you
 * occasionally poll the prefetch cache to check if anything is missing.
 */
export function prefetch(
  href: string,
  nextUrl: string | null,
  treeAtTimeOfPrefetch: FlightRouterState,
  fetchStrategy: PrefetchTaskFetchStrategy,
  onInvalidate: null | (() => void)
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
    fetchStrategy,
    PrefetchPriority.Default,
    onInvalidate
  )
}
