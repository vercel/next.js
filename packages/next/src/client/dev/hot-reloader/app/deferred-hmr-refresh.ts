// The HMR WebSocket is opened before the App Router hydrates (see
// `client/app-index.tsx`), so a server change can be reported before the
// router is able to handle a refresh. Dispatching it then throws ("Router
// action dispatched before initialization") and the refresh is lost, which
// leaves the page showing stale content after e.g. a page was added back.
// Instead, remember that a refresh was requested and run it once the router
// has mounted. Development only.

import { InvariantError } from '../../../../shared/lib/invariant-error'

let isRouterMounted = false
let pendingRefresh: (() => void) | null = null

/**
 * Runs `refresh` now if the App Router has mounted. Otherwise runs it once
 * the router mounts. Multiple early requests coalesce into a single refresh,
 * since one refresh fetches the latest server state. Every caller passes the
 * same router refresh function, so a different one indicates a bug.
 */
export function requestHmrRefresh(refresh: () => void): void {
  if (isRouterMounted) {
    refresh()
  } else if (pendingRefresh === null) {
    pendingRefresh = refresh
  } else if (pendingRefresh !== refresh) {
    throw new InvariantError(
      'Expected every deferred HMR refresh to use the same refresh function.'
    )
  }
}

/**
 * Called once the App Router has mounted (from the HotReload component's
 * mount effect, which runs after the router is initialized).
 */
export function onAppRouterMounted(): void {
  isRouterMounted = true
  const refresh = pendingRefresh
  pendingRefresh = null
  refresh?.()
}
