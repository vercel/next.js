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

import type { FlightRouterState } from '../../../shared/lib/app-router-types'
import { NEXT_INSTANT_TEST_COOKIE } from '../app-router-headers'
import { refreshOnInstantNavigationUnlock } from '../use-action-queue'

type InstantNavCookieState = 'pending' | 'mpa' | 'spa'

type InstantCookie =
  // pending (waiting to capture)
  | [captured: 0, id: string]
  // captured MPA page load
  | [captured: 1, id: string, state: null]
  // captured SPA navigation (from/to route trees)
  | [
      captured: 1,
      id: string,
      state: { from: FlightRouterState; to: FlightRouterState | null },
    ]

function parseCookieValue(raw: string): InstantNavCookieState {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const rawState = parsed[2]
      return rawState === null ? 'mpa' : 'spa'
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
  cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((existing: any) => {
    if (existing) {
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
}

let lockState: NavigationLockState | null = null

function acquireLock(): void {
  if (lockState !== null) {
    return
  }
  let resolve: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  lockState = { promise, resolve: resolve! }
}

function releaseLock(): void {
  if (lockState !== null) {
    lockState.resolve()
    lockState = null
  }
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

      writeCookieValue([1, `c${Math.random()}`, null])
      acquireLock()
    }

    if (typeof cookieStore === 'undefined') {
      return
    }

    cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
      for (const cookie of event.changed) {
        if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
          const state = parseCookieValue(cookie.value ?? '')

          if (state !== 'pending') {
            // Captured value — our own transition. Ignore.
            return
          }

          // Pending value — external actor starting a new lock scope.
          if (lockState !== null) {
            releaseLock()
          }
          acquireLock()
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
 * Transitions the cookie from pending to captured-SPA. Called when a
 * client-side navigation is captured by the lock.
 *
 * @param fromTree - The flight router state of the from-route
 * @param toTree - The flight router state of the to-route (null if not yet known)
 */
export function transitionToCapturedSPA(
  fromTree: FlightRouterState,
  toTree: FlightRouterState | null
): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    writeCookieValue([1, `c${Math.random()}`, { from: fromTree, to: toTree }])
  }
}

/**
 * Updates the captured-SPA cookie with the resolved route trees.
 * Called after the prefetch resolves and the target route tree is known.
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
    return lockState !== null
  }
  return false
}

/**
 * Waits for the navigation lock to be released, if it's currently held.
 * No-op if the lock is not acquired.
 */
export async function waitForNavigationLockIfActive(): Promise<void> {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      await lockState.promise
    }
  }
}
