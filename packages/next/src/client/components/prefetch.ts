import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { PrefetchOptions } from '../../shared/lib/app-router-context.shared-runtime'
import { PrefetchKind } from './router-reducer/router-reducer-types'
import { createPrefetchURL } from './app-router-utils'
import { getCurrentAppRouterState } from './app-router-instance'
import { isJavaScriptURLString } from '../lib/javascript-url'
import { createCacheKey } from './segment-cache/cache-key'
import { schedulePrefetchTask } from './segment-cache/scheduler'
import {
  FetchStrategy,
  PrefetchPriority,
  type PrefetchTaskFetchStrategy,
} from './segment-cache/types'

/**
 * The public prefetch operation, exposed through `router.prefetch`. Converts
 * the public options into a fetch strategy, reads the current router state,
 * and drives the Segment Cache.
 *
 * Unlike the old implementation, the Segment Cache doesn't store its data in
 * the router reducer state; it writes into a global mutable cache. So we
 * don't need to dispatch an action.
 */
export function prefetchRoute(href: string, options?: PrefetchOptions): void {
  if (isJavaScriptURLString(href)) {
    throw new Error(
      'Next.js has blocked a javascript: URL as a security precaution.'
    )
  }
  const state = getCurrentAppRouterState()
  if (state === null) {
    throw new Error(
      'Internal Next.js error: Router action dispatched before initialization.'
    )
  }
  const prefetchKind = options?.kind ?? PrefetchKind.AUTO

  // We don't currently offer a way to issue a runtime prefetch via `router.prefetch()`.
  // This will be possible when we update its API to not take a PrefetchKind.
  let fetchStrategy: PrefetchTaskFetchStrategy
  switch (prefetchKind) {
    case PrefetchKind.AUTO: {
      // We default to PPR. We'll discover whether or not the route supports it with the initial prefetch.
      fetchStrategy = FetchStrategy.PPR
      break
    }
    case PrefetchKind.FULL: {
      fetchStrategy = FetchStrategy.Full
      break
    }
    default: {
      prefetchKind satisfies never
      // Despite typescript thinking that this can't happen,
      // we might get an unexpected value from user code.
      // We don't know what they want, but we know they want a prefetch,
      // so use the default.
      fetchStrategy = FetchStrategy.PPR
    }
  }

  prefetch(
    href,
    state.nextUrl,
    state.tree,
    fetchStrategy,
    options?.onInvalidate ?? null
  )
}

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
    onInvalidate,
    null // navigationLockPrefetch
  )
}
