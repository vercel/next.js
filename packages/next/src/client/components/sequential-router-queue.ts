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
  type PreparedNavigationRecord,
  ScrollBehavior,
} from './router-reducer/router-reducer-types'
import type {
  NavigateOptions,
  PreparedNavigation,
} from '../../shared/lib/app-router-context.shared-runtime'
import { dispatchAppRouterAction } from './use-action-queue'
import { getCurrentAppRouterState } from './app-router-instance'
import { setLinkForCurrentNavigation, type LinkInstance } from './links'
import type { RouterTransitionPrefetchIntent } from '../router-transition-types'
import { startRouterTransition } from './router-transition'
import { addBasePath } from '../add-base-path'
import { isExternalURL } from './app-router-utils'
import { isJavaScriptURLString } from '../lib/javascript-url'
import { resetKnownRoutes } from './segment-cache/optimistic-routes'
import { navigate as navigateAppRouterState } from './app-router-state'
import { FreshnessPolicy } from './render-tree'
import { getBFCacheVersion } from './segment-cache/bfcache'

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
  dispatchNavigation(
    href,
    navigateType,
    scrollBehavior,
    linkInstanceRef,
    transitionTypes,
    prefetchIntent,
    null
  )
}

function dispatchNavigation(
  href: string,
  navigateType: NavigateAction['navigateType'],
  scrollBehavior: ScrollBehavior,
  linkInstanceRef: LinkInstance | null,
  transitionTypes: string[] | undefined,
  prefetchIntent: RouterTransitionPrefetchIntent | null,
  // Set when this is the commit phase of a prepared navigation. See
  // `prepare`.
  preparation: PreparedNavigationRecord | null
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
      preparation,
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
 * Start a navigation without committing it (`router.experimental_prepare()`).
 * This performs the same work as a regular navigation, including the dynamic
 * request, but does not update the router. The data is written into the
 * BFCache.
 *
 * Calling `push` or `replace` on the result performs a regular navigation
 * that reuses anything the prepare phase wrote into the BFCache, regardless
 * of stale time, including data that is still streaming in. If the prepared
 * navigation is never committed, nothing else happens; the data stays in the
 * BFCache, where a back/forward navigation to an overlapping segment may
 * observe it.
 */
export function prepare(href: string): PreparedNavigation {
  if (isJavaScriptURLString(href)) {
    throw new Error(
      'Next.js has blocked a javascript: URL as a security precaution.'
    )
  }

  const preparation: PreparedNavigationRecord = {
    preparedAt: Date.now(),
    bfcacheVersion: getBFCacheVersion(),
    inFlightRequest: null,
    inFlightRequestTree: null,
  }

  // Resolve the URL now, so a relative href is committed against the location
  // it was prepared from, even if the user navigates elsewhere in between.
  const url = new URL(addBasePath(href), location.href)

  const state = getCurrentAppRouterState()
  if (state !== null) {
    if (!isExternalURL(url)) {
      const currentUrl = new URL(state.canonicalUrl, location.href)
      // Discard the resulting state. The only lasting effects are the
      // requests that were spawned and the BFCache entries they fill in.
      navigateAppRouterState(
        state,
        url,
        currentUrl,
        state.renderedSearch,
        state.root,
        state.tree,
        state.nextUrl,
        FreshnessPolicy.Prepare,
        // Scroll and history behavior are decided by the commit. NoScroll
        // leaves the current navigation's pending scroll untouched.
        ScrollBehavior.NoScroll,
        'push',
        preparation
      )
    }
  }

  // A prepared navigation can only be committed once.
  let didCommit = false
  return {
    push: (options?: NavigateOptions) => {
      if (didCommit) {
        warnPreparedNavigationAlreadyCommitted(href)
        return
      }
      didCommit = true
      dispatchNavigation(
        url.href,
        'push',
        options?.scroll === false
          ? ScrollBehavior.NoScroll
          : ScrollBehavior.Default,
        null,
        options?.transitionTypes,
        null,
        preparation
      )
    },
    replace: (options?: NavigateOptions) => {
      if (didCommit) {
        warnPreparedNavigationAlreadyCommitted(href)
        return
      }
      didCommit = true
      dispatchNavigation(
        url.href,
        'replace',
        options?.scroll === false
          ? ScrollBehavior.NoScroll
          : ScrollBehavior.Default,
        null,
        options?.transitionTypes,
        null,
        preparation
      )
    },
  }
}

function warnPreparedNavigationAlreadyCommitted(href: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(
      `The prepared navigation to "${href}" was already committed. Calling ` +
        '`push` or `replace` again has no effect. To navigate again, call ' +
        '`router.experimental_prepare()` again, or use `router.push()`.'
    )
  }
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
