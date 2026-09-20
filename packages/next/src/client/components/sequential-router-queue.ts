// The sequential-router-queue implementation of the navigator interface
// (navigator.ts). Callers must never import this module directly; they import
// './navigator', which resolves here unless `experimental.
// concurrentRouterQueue` swaps in `./concurrent-router-queue` at the bundler
// level (see create-compiler-aliases.ts and next_import_map.rs).
//
// The legacy reducer action objects are an implementation detail of the
// sequential action queue; they are constructed here and never by callers.
//
// This module must remain free of side effects at module scope: in addition
// to the browser bundle, a statically-resolved copy is compiled into the
// pre-compiled app-page runtime bundles (via app-render.tsx), where the
// bundler alias cannot reach. Only the browser copy's operations ever run.

import { addTransitionType, startTransition } from 'react'
import {
  ACTION_HMR_REFRESH,
  ACTION_NAVIGATE,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_PATCH,
  type AppHistoryState,
  type AppRouterState,
  type NavigateAction,
  ScrollBehavior,
  type ServerPatchAction,
} from './router-reducer/router-reducer-types'
import type { NavigateOptions } from '../../shared/lib/app-router-context.shared-runtime'
import { dispatchAppRouterAction } from './use-action-queue'
import { getCurrentAppRouterState } from './app-router-instance'
import { setLinkForCurrentNavigation, type LinkInstance } from './links'
import type { RouterTransitionPrefetchIntent } from '../router-transition-types'
import { startRouterTransition } from './router-transition'
import { addBasePath } from '../add-base-path'
import { isExternalURL } from './app-router-utils'
import { isJavaScriptURLString } from '../lib/javascript-url'
import {
  discoverKnownRoute,
  resetKnownRoutes,
} from './segment-cache/optimistic-routes'
import {
  markRouteEntryAsDynamicRewrite,
  invalidateRouteCacheEntries,
  type FulfilledRouteCacheEntry,
} from './segment-cache/cache'
import { getLastCommittedTree } from './router-reducer/reducers/committed-state'
import { createHrefFromUrl } from './router-reducer/create-href-from-url'
import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { NavigationSeed } from './segment-cache/decode-server-response'
import type { NormalizedSearch } from './segment-cache/cache-key'
import type { FreshnessPolicy } from './render-tree'

function getRequiredAppRouterState(): AppRouterState {
  const state = getCurrentAppRouterState()
  if (state === null) {
    throw new Error(
      'Internal Next.js error: Router action dispatched before initialization.'
    )
  }
  return state
}

export function navigate(
  href: string,
  navigateType: NavigateAction['navigateType'],
  scrollBehavior: ScrollBehavior,
  linkInstanceRef: LinkInstance | null,
  transitionTypes: string[] | undefined,
  prefetchIntent: RouterTransitionPrefetchIntent | null
): void {
  if (isJavaScriptURLString(href)) {
    throw new Error(
      'Next.js has blocked a javascript: URL as a security precaution.'
    )
  }

  startTransition(() => {
    // TODO: This stuff could just go into the reducer. Leaving as-is for now
    // since we're about to rewrite all the router reducer stuff anyway.

    if (transitionTypes) {
      for (const type of transitionTypes) {
        addTransitionType(type)
      }
    }

    const url = new URL(addBasePath(href), location.href)
    if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
      window.next.__pendingUrl = url
    }

    setLinkForCurrentNavigation(linkInstanceRef)
    startRouterTransition(
      href,
      navigateType,
      getRequiredAppRouterState().tree,
      prefetchIntent
    )

    dispatchAppRouterAction({
      type: ACTION_NAVIGATE,
      url,
      isExternalUrl: isExternalURL(url),
      locationSearch: location.search,
      scrollBehavior,
      navigateType,
    })
  })
}

export function push(href: string, options?: NavigateOptions): void {
  navigate(
    href,
    'push',
    options?.scroll === false
      ? ScrollBehavior.NoScroll
      : ScrollBehavior.Default,
    null,
    options?.transitionTypes,
    null
  )
}

export function replace(href: string, options?: NavigateOptions): void {
  navigate(
    href,
    'replace',
    options?.scroll === false
      ? ScrollBehavior.NoScroll
      : ScrollBehavior.Default,
    null,
    options?.transitionTypes,
    null
  )
}

export function traverse(
  href: string,
  historyState: AppHistoryState | undefined
): void {
  startTransition(() => {
    startRouterTransition(
      href,
      'traverse',
      getRequiredAppRouterState().tree,
      null
    )
    restore(new URL(href), historyState)
  })
}

/**
 * Sync the router state to a history entry that was written by something
 * other than a router navigation (a userland pushState/replaceState, or a
 * bfcache restore). Unlike a traversal, this does not represent a transition
 * between routes.
 */
export function restore(
  url: URL,
  historyState: AppHistoryState | undefined
): void {
  startTransition(() => {
    dispatchAppRouterAction({
      type: ACTION_RESTORE,
      url,
      historyState,
    })
  })
}

/**
 * The bfcache `pageshow` restore (see the pageshow handler in app-router.tsx).
 * Unlike every other navigator operation, this dispatches as a deliberately
 * urgent (non-transition) update: the restored state reset must render before
 * anything else can observe the stale mpaNavigation state and re-fire the MPA
 * navigation the restore exists to prevent. As a transition it would be
 * interruptible, and an intervening urgent render could commit against the
 * stale state first.
 *
 * This is a preserved legacy special case. It will not be carried into the
 * concurrent router queue, which handles bfcache restore through its own
 * design.
 */
export function legacyUrgentBFCacheRestore(
  url: URL,
  historyState: AppHistoryState | undefined
): void {
  dispatchAppRouterAction({
    type: ACTION_RESTORE,
    url,
    historyState,
  })
}

export function refresh(): void {
  startTransition(() => {
    dispatchAppRouterAction({
      type: ACTION_REFRESH,
    })
  })
}

// Represents whether the previous navigation resulted in a route tree mismatch.
// A mismatch results in a refresh of the page. If there are two successive
// mismatches, we will fall back to an MPA navigation, to prevent a retry loop.
//
// NOTE: This state was originally tracked directly in the render-tree.ts
// module. In the Concurrent Router implementation, we will likely track this
// as part of the internal router state machine.
let previousNavigationDidMismatch = false

/**
 * Internal operation, not a user-facing one: the back-edge from shared
 * navigation machinery (render-tree.ts), called when a navigation request's
 * dynamic server response does not match the client tree. Responds by
 * dispatching a refresh of the (possibly redirect-corrected) target. There is
 * no originating event, and deliberately no startTransition here — the
 * refresh's transition comes from the action queue's internal wrap.
 *
 * @param url The (possibly redirect-corrected) target URL.
 * @param seed Server data to reuse, if any.
 * @param baseTree The tree the failed navigation was based on.
 * @param routeCacheEntry The route cache entry used for the navigation, if it
 * came from route prediction; since the navigation resulted in a mismatch, it
 * is marked as having a dynamic rewrite so future predictions bail out.
 * @param navigateType The original navigation's push/replace intent.
 * @param hard Escalate to an MPA navigation. Raw per-mismatch value; even
 * when false, the refresh escalates here if the previous navigation
 * also mismatched.
 */
export function finishMismatchedNavigationRequest(
  url: URL,
  nextUrl: string | null,
  seed: NavigationSeed | null,
  baseTree: FlightRouterState,
  routeCacheEntry: FulfilledRouteCacheEntry | null,
  navigateType: 'push' | 'replace',
  hard: boolean,
  freshness: FreshnessPolicy.RefreshAll | FreshnessPolicy.HistoryTraversal
): void {
  // If the navigation used a route prediction, mark it as having a dynamic
  // rewrite since it resulted in a mismatch.
  if (routeCacheEntry !== null) {
    markRouteEntryAsDynamicRewrite(routeCacheEntry)
  } else if (seed !== null) {
    // Even without a direct reference to the route cache entry, we can still
    // mark the route as having a dynamic rewrite by traversing the known route
    // tree. This handles cases where the navigation didn't originate from a
    // route prediction, but still needs to mark the pattern.
    const metadataVaryPath = seed.metadataVaryPath
    if (metadataVaryPath !== null) {
      const now = Date.now()
      discoverKnownRoute(
        now,
        url.pathname,
        url.search as NormalizedSearch,
        nextUrl,
        null,
        seed.routeTree,
        metadataVaryPath,
        false, // couldBeIntercepted - doesn't matter, we're just marking hasDynamicRewrite
        createHrefFromUrl(url),
        false, // supportsPerSegmentPrefetching - doesn't matter, we're just marking hasDynamicRewrite
        true // hasDynamicRewrite
      )
    }
  }

  // Invalidate all route cache entries. Other entries may have been derived
  // from the template before we knew it had a dynamic rewrite. This also
  // triggers re-prefetching of visible links.
  invalidateRouteCacheEntries(nextUrl, baseTree)

  // If this is the second time in a row that a navigation resulted in a
  // mismatch, fall back to a hard (MPA) refresh.
  hard = hard || previousNavigationDidMismatch
  previousNavigationDidMismatch = true

  // If the original navigation hasn't committed to the browser history yet
  // (the transition suspended before React committed), inherit its push/replace
  // intent. Otherwise, the pushState already ran, so use 'replace' to avoid
  // creating a duplicate history entry.
  //
  // This works because React entangles the retry's state update with the
  // original pending transition — they commit together as a single batch,
  // so the navigate type from the retry is what HistoryUpdater ultimately sees.
  const lastCommitted = getLastCommittedTree()
  const retryNavigateType: 'push' | 'replace' =
    lastCommitted !== null && baseTree !== lastCommitted
      ? navigateType
      : 'replace'

  const retryAction: ServerPatchAction = {
    type: ACTION_SERVER_PATCH,
    previousTree: baseTree,
    url,
    nextUrl,
    seed,
    mpa: hard,
    navigateType: retryNavigateType,
    freshnessPolicy: freshness,
  }
  dispatchAppRouterAction(retryAction)
}

/**
 * Internal operation, not a user-facing one: called by shared navigation
 * machinery (render-tree.ts) when a navigation request completes without a
 * tree mismatch — either fully cached, or all of its dynamic requests
 * finished cleanly. Clears the two-strike mismatch-escalation state.
 */
export function finishNavigationRequest(): void {
  previousNavigationDidMismatch = false
}

// Tracks the newest HMR refresh generation so that a newer refresh can abort
// the request of the one it supersedes. Development only.
let activeHmrRefreshController: AbortController | null = null

// Development only.
export function hmrRefresh(): void {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'hmrRefresh can only be used in development mode. Please use refresh instead.'
    )
  } else {
    // Reset the known routes table so that route predictions are cleared
    // when routes change during development.
    resetKnownRoutes()
    let signal: AbortSignal | undefined
    if (process.env.__NEXT_SERVER_COMPONENTS_HMR_CANCELLATION) {
      // Abort the superseded generation before scheduling the new one, so its
      // request is torn down as early as possible. Halting (not rejecting)
      // makes the abort safe regardless of order.
      activeHmrRefreshController?.abort()
      activeHmrRefreshController = new AbortController()
      signal = activeHmrRefreshController.signal
    }
    startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_HMR_REFRESH,
        signal,
      })
    })
  }
}
