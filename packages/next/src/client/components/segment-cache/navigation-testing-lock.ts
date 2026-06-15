/**
 * Navigation lock for the Instant Navigation Testing API.
 *
 * Manages the in-memory lock (a promise) that gates dynamic data writes
 * during instant navigation captures, and owns all cookie state
 * transitions (pending → captured-MPA, pending → captured-SPA).
 *
 * External actors (Playwright, devtools) set [0] to start a lock scope
 * and delete the cookie to end one. Next.js writes captured values.
 * The CookieStore handler distinguishes them by value: pending = external,
 * captured = self-write (ignored).
 */

import type {
  FlightRouterState,
  InstantCookie,
} from '../../../shared/lib/app-router-types'
import { NEXT_INSTANT_TEST_COOKIE } from '../app-router-headers'
import { refreshOnInstantNavigationUnlock } from '../use-action-queue'

type InstantNavCookieState = 'empty' | 'pending' | 'mpa' | 'spa'

function parseCookieValue(raw: string): InstantNavCookieState {
  if (raw === '') {
    return 'empty'
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      if (parsed.length >= 3) {
        const rawState = parsed[2]
        return rawState === null ? 'mpa' : 'spa'
      }
    }
  } catch {}
  return 'pending'
}

function writeCookieValue(value: InstantCookie): void {
  if (typeof cookieStore === 'undefined') {
    return
  }
  // Read the existing cookie to preserve its attributes (domain, path),
  // then write back with the new value. This updates the same cookie
  // entry that the external actor created, regardless of how it was
  // scoped.
  //
  // Capture the current lockState and compare it in the callback so we
  // only write if the lock we observed at call time is still held. This
  // guards against two races: (a) the scope ended between get and set
  // (lockState is now null), and (b) the scope ended and a new one was
  // acquired in the same gap (lockState is a different object). In
  // either case we must not write — doing so would leak stale state
  // into the next scope or outlive the current one.
  const lockAtCall = lockState
  cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((existing: any) => {
    if (existing && lockState === lockAtCall && lockAtCall !== null) {
      const options: any = {
        name: NEXT_INSTANT_TEST_COOKIE,
        value: JSON.stringify(value),
        path: existing.path ?? '/',
      }
      if (existing.domain) {
        options.domain = existing.domain
      }
      cookieStore.set(options)
    }
  })
}

type NavigationLockState = {
  promise: Promise<void>
  resolve: () => void
  // The pre-lock `window.fetch`, captured at `acquireLock` time and
  // restored at `releaseLock`. Internal Next.js code reads this via
  // `getPreLockFetch` to bypass the override we install on `window.fetch`
  // during a lock scope.
  fetch: typeof fetch
}

let lockState: NavigationLockState | null = null

export function getPreLockFetch(): typeof fetch | null {
  return lockState !== null ? lockState.fetch : null
}

function acquireLock(): void {
  if (lockState !== null) {
    return
  }
  let resolve: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  lockState = { promise, resolve: resolve!, fetch: window.fetch }

  // Install the fetch blocker. We only intercept `window.fetch` for the
  // duration of the lock so that — outside of a testing scope — user-
  // installed overrides of `window.fetch` are untouched.
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    window.fetch = globalFetchOverride
  }
}

function releaseLock(): void {
  if (lockState === null) {
    return
  }
  // Restore the pre-lock `window.fetch` before resolving the lock promise
  // so any fetches queued on the promise see the restored fetch.
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    window.fetch = lockState.fetch
  }
  const { resolve } = lockState
  lockState = null
  resolve()
}

/**
 * Global fetch override
 *
 * While the navigation lock is active, we install this as `window.fetch` so
 * out-of-band client-side fetches (e.g. `fetch('/api/data')` inside a
 * useEffect) are blocked until the lock is released. Next.js internals
 * bypass the override by importing `fetch` from `./fetch`, which reads the
 * captured pre-lock fetch via `getPreLockFetch`.
 *
 * NOTE: This override only affects environments where the Instant Navigation
 * Testing API is enabled. It has no impact on live production behavior.
 */
export function globalFetchOverride(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (lockState === null) {
    // Lock is not active. Fall through to the global fetch — we reach this
    // only if a caller captured a reference to this function during a lock
    // scope and invoked it after release.
    return fetch(input, init)
  }
  // Block user-initiated fetches until the lock is released, then dispatch
  // through the fetch captured at acquire time. Reading from `lockState`
  // (rather than `window.fetch`) pins to the capture even if `window.fetch`
  // is reassigned after release.
  const currentLock = lockState
  return currentLock.promise.then(() => {
    const preLockFetch = currentLock.fetch
    return preLockFetch(input, init)
  })
}

/**
 * Sets up the cookie-based lock. Handles the initial page load state and
 * registers a CookieStore listener for runtime changes.
 *
 * Called once during page initialization from app-globals.ts.
 */
export function startListeningForInstantNavigationCookie(): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    // If the server served a static shell, this is an MPA page load
    // while the lock is held. Transition to captured-MPA and acquire.
    if (self.__next_instant_test) {
      if (typeof cookieStore !== 'undefined') {
        // If the cookie was already cleared during the MPA page
        // transition, reload to get the full dynamic page.
        cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((cookie: any) => {
          if (!cookie) {
            window.location.reload()
          }
        })
      }

      // Acquire the lock before writing the cookie. writeCookieValue's
      // guard requires lockState to be non-null at call time (so a stale
      // write can't outlive its scope). On a fresh page load that scope
      // is the one we're about to establish, so we have to establish it
      // first.
      acquireLock()
      writeCookieValue([1, `c${Math.random()}`, null])
    }

    if (typeof cookieStore === 'undefined') {
      return
    }

    cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
      for (const cookie of event.changed) {
        if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
          const state = parseCookieValue(cookie.value ?? '')

          if (state === 'pending') {
            // External actor starting a new lock scope.
            if (lockState !== null) {
              // This can be the delayed CookieStore event for the pending
              // cookie that was already observed synchronously from
              // document.cookie. Keep the existing lock identity so work that
              // captured it keeps waiting on the same promise.
              return
            }
            acquireLock()
          }
          // Captured value (our own transition) or empty. Ignore.
          return
        }
      }

      for (const cookie of event.deleted) {
        if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
          releaseLock()
          refreshOnInstantNavigationUnlock()
          return
        }
      }
    })
  }
}

/**
 * Transitions the cookie from pending to captured-SPA once the prefetch resolves
 * and the navigation is known to be an SPA.
 */
export function updateCapturedSPAToTree(
  fromTree: FlightRouterState,
  toTree: FlightRouterState
): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    writeCookieValue([1, `c${Math.random()}`, { from: fromTree, to: toTree }])
  }
}

/**
 * Returns true if the navigation lock is currently active.
 */
export function isNavigationLocked(): boolean {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      return true
    }

    // If `lockState` is null, fall back to reading the test cookie
    // synchronously from `document.cookie`. This accounts for a small race
    // between `cookieStore.set(...)` and its corresponding `change` event.
    // During that gap `lockState` is still null even though the cookie
    // indicates a new lock scope is starting.
    if (typeof document === 'undefined') {
      return false
    }
    const allCookies = document.cookie
    if (!allCookies.includes(NEXT_INSTANT_TEST_COOKIE)) {
      // Fast bail-out: in almost every navigation the test cookie is not
      // set at all.
      return false
    }
    const target = NEXT_INSTANT_TEST_COOKIE + '='
    for (const segment of allCookies.split(';')) {
      const trimmed = segment.trim()
      if (
        trimmed.startsWith(target) &&
        parseCookieValue(trimmed.slice(target.length)) === 'pending'
      ) {
        // The cookie was set by an external actor but the change event was not
        // yet dispatched. Acquire the lock synchronously.
        acquireLock()
        return true
      }
    }
  }
  return false
}

export function getCurrentNavigationLock(): Promise<void> | null {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    return lockState !== null ? lockState.promise : null
  }
  return null
}

/**
 * Waits for the navigation lock to be released, if it's currently held.
 * No-op if the lock is not acquired.
 */
export async function waitForNavigationLockIfActive(
  lock: Promise<void> | null = getCurrentNavigationLock()
): Promise<void> {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lock !== null) {
      await lock
    }
  }
}
