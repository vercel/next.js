/**
 * Centralized offline detection, state management, and retry logic.
 *
 * This module tracks whether the app is offline and provides primitives for
 * retrying failed network requests. It is designed to be extended in the
 * future — e.g., instrumenting module chunk loading, Flight chunk resolution,
 * or eventually being promoted to a React-level feature.
 *
 * All stateful behavior (event listeners, polling, state tracking) only runs
 * in the browser. On the server and during hydration, getOffline() always
 * returns false.
 *
 * ## Known limitation: queued fetches
 *
 * When the user navigates multiple times while offline, each navigation queues
 * a separate fetch that blocks on waitForConnection(). When connectivity is
 * restored, all of them resume and retry simultaneously.
 *
 * Future mitigations:
 * - Stale cache access (PR 3): offline navigations will reuse back-forward
 *   cache entries, so most navigations won't issue new fetches at all. This is
 *   the primary shield against duplicate requests.
 * - Fetch cancellation: on router.refresh(), we could abort pending blocked
 *   fetches since refresh invalidates all dynamic caches.
 */

// Backoff delays for the polling loop: 500ms → 1s → 2s → 3s (cap)

// Timeout for the HEAD connectivity check. If the request doesn't resolve
// within this window, we assume we're still offline. 200ms is more than enough
// — network errors reject almost instantly.
const CONNECTIVITY_CHECK_TIMEOUT_MS = 200

import { pingPrefetchScheduler } from './segment-cache/scheduler'
import { fetch } from './segment-cache/fetch'
import { RSC_HEADER } from './app-router-headers'
import { dispatchOfflineChange } from './use-offline'

export type OfflineState = {
  promise: Promise<void>
  resolve: () => void
  timeoutHandle: ReturnType<typeof setTimeout> | null
  backoffStep: number
}

let offlineState: OfflineState | null = null

/**
 * Returns true if the error from a fetch() rejection indicates a network
 * failure (as opposed to an intentional abort or timeout). If it is a
 * network error, also starts the connectivity polling loop.
 *
 * - AbortError: the request was intentionally canceled via AbortSignal
 * - TimeoutError: AbortSignal.timeout() expired — could be a slow server,
 *   not necessarily offline
 */
export function checkOfflineError(err: unknown): boolean {
  if (err instanceof DOMException) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return false
    }
  }
  notifyOffline()
  return true
}

/**
 * Returns whether the app is currently considered offline (i.e., a
 * connectivity polling loop is active). Always returns false on the
 * server and during hydration.
 */
export function getOffline(): OfflineState | null {
  return offlineState
}

/**
 * Enters the offline state if not already in it, and starts the
 * connectivity polling loop.
 */
function notifyOffline(): OfflineState {
  if (offlineState !== null) {
    return offlineState
  }
  let resolve: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  offlineState = {
    promise,
    resolve: resolve!,
    timeoutHandle: null,
    backoffStep: 0,
  }
  dispatchOfflineChange(true)
  checkConnectivity(offlineState)
  return offlineState
}

/**
 * Call this when any network request succeeds while we're in the offline state.
 * If a polling loop is active, this short-circuits it — no need to wait for
 * the next HEAD check if we already know we're back online.
 */
export function notifyOnline(): void {
  if (offlineState === null) {
    return
  }
  if (offlineState.timeoutHandle !== null) {
    clearTimeout(offlineState.timeoutHandle)
  }
  const resolve = offlineState.resolve
  offlineState = null
  resolve()
  dispatchOfflineChange(false)
  pingPrefetchScheduler()
}

/**
 * Does a HEAD request to confirm connectivity, then either resolves the
 * offline state or schedules the next check with backoff.
 */
async function checkConnectivity(state: OfflineState): Promise<void> {
  // Cancel any previously scheduled check so we don't end up with
  // parallel polling loops.
  if (state.timeoutHandle !== null) {
    clearTimeout(state.timeoutHandle)
    state.timeoutHandle = null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    CONNECTIVITY_CHECK_TIMEOUT_MS
  )
  try {
    // HEAD request to the current page with the RSC header, so we're
    // testing connectivity to the same endpoint that navigations use.
    await fetch(location.href, {
      method: 'HEAD',
      headers: { [RSC_HEADER]: '1' },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    // If the fetch didn't throw, we're back online.
    notifyOnline()
  } catch (err) {
    // If the error is from our own timeout abort, that actually means
    // the request went out and is waiting for a response — i.e., we're
    // back online. A truly offline request fails almost instantly (well
    // within the 200ms timeout).
    if (err instanceof DOMException && err.name === 'AbortError') {
      clearTimeout(timeoutId)
      notifyOnline()
      return
    }
    // Network error — still offline. Schedule the next check with backoff.
    const delay =
      state.backoffStep === 0
        ? 500
        : state.backoffStep === 1
          ? 1000
          : state.backoffStep === 2
            ? 2000
            : 3000
    state.backoffStep++
    state.timeoutHandle = setTimeout(() => checkConnectivity(state), delay)
  }
}

/**
 * Returns a promise that resolves when connectivity is restored.
 */
export function waitForConnection(state: OfflineState) {
  return state.promise
}

function pingOfflineState() {
  if (offlineState !== null) {
    checkConnectivity(offlineState)
  }
}

// Set up browser event listeners for proactive offline detection.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', notifyOffline)
  window.addEventListener('online', pingOfflineState)
}
