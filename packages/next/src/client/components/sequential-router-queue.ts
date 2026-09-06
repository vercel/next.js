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
  type AppHistoryState,
  type AppRouterState,
  type NavigateAction,
  ScrollBehavior,
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
import { resetKnownRoutes } from './segment-cache/optimistic-routes'

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
