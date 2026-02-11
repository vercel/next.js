/**
 * Navigation lock for the Instant Navigation Testing API.
 *
 * This module is not meant to be used directly. It's exposed on the window
 * object and intended to be called via a wrapper API integrated into an
 * e2e testing framework like Playwright:
 *
 *   async function instant(page, fn) {
 *     await page.evaluate(() => window.__EXPERIMENTAL_NEXT_TESTING__.navigation.lock())
 *     try {
 *       return await fn()
 *     } finally {
 *       await page.evaluate(() => window.__EXPERIMENTAL_NEXT_TESTING__.navigation.unlock())
 *     }
 *   }
 *
 *   // Usage in a test:
 *   await instant(page, async () => {
 *     await page.click('a[href="/product"]')
 *     await expect(page.locator('[data-testid="loading"]')).toBeVisible()
 *   })
 *
 * When the lock is acquired:
 * - Routes without a prefetch cache hit will wait for prefetch to complete
 *   before navigating.
 * - Routes with a prefetch cache hit will wait before writing dynamic data
 *   into the UI.
 *
 * For MPA navigations (page reload, full page load):
 * - A cookie is set that tells the server to render only the static shell.
 * - When the lock is released, the cookie is cleared and a refresh is
 *   triggered to fetch dynamic data.
 *
 * This allows tests to assert on the prefetched UI state before dynamic
 * content streams in. Network requests are not blocked - they proceed in
 * parallel while the lock is held.
 *
 * All functions in this module are wrapped in checks for the testing API,
 * which is not exposed in production builds by default. This ensures the code
 * is dead code eliminated unless explicitly enabled.
 */

import { NEXT_INSTANT_TEST_COOKIE } from '../app-router-headers'

type NavigationLockState = {
  promise: Promise<void>
  resolve: () => void
}

let lockState: NavigationLockState | null = null

// Tracks whether the page was loaded while the instant test cookie was set.
// When true, releasing the lock will trigger a refresh to fetch dynamic data.
let mpaLockedStateNeedsRefresh = false

/**
 * Acquires the navigation lock. While locked, navigations will wait for
 * prefetch tasks to complete before proceeding.
 *
 * Also sets a cookie so that MPA navigations (page reload, full page load)
 * will render only the static shell.
 *
 * Logs an error if the lock is already acquired (concurrent locks are not
 * allowed).
 *
 * Not exposed in production builds by default.
 */
export function acquireNavigationLock(): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      console.error(
        'Navigation lock already acquired. Concurrent locks are not allowed. ' +
          'Did you forget to release the previous lock?'
      )
      return
    }

    let resolve: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    lockState = { promise, resolve: resolve! }

    // Set cookie for MPA navigations
    document.cookie = `${NEXT_INSTANT_TEST_COOKIE}=1;path=/`
  }
}

/**
 * Releases the navigation lock. Any navigations that were waiting for
 * prefetch completion will now proceed with dynamic data fetching.
 *
 * If the page was loaded while locked (MPA navigation), this also triggers
 * a refresh to fetch the dynamic data that was blocked during the initial
 * page load.
 *
 * The cookie is always cleared to prevent stale state, even if the
 * in-memory lock was not acquired.
 *
 * Not exposed in production builds by default.
 */
export function releaseNavigationLock(): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      lockState.resolve()
      lockState = null
    }

    // Clear the cookie
    document.cookie = `${NEXT_INSTANT_TEST_COOKIE}=;path=/;max-age=0`

    // If the page was loaded with the cookie set (MPA navigation), trigger a
    // refresh to fetch the dynamic data that was blocked during SSR.
    if (mpaLockedStateNeedsRefresh) {
      mpaLockedStateNeedsRefresh = false
      const { refreshAfterInstantNavigationTest } =
        require('../app-router-instance') as typeof import('../app-router-instance')
      refreshAfterInstantNavigationTest()
    }
  }
}

/**
 * Returns true if the navigation lock is currently active. Checks the cookie
 * rather than in-memory lockState because the cookie survives across MPA
 * navigations (page reloads).
 *
 * Not exposed in production builds by default. Always returns false when the
 * testing API is not available.
 */
export function isNavigationLocked(): boolean {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    return document.cookie.includes(NEXT_INSTANT_TEST_COOKIE + '=')
  }
  return false
}

/**
 * Waits for the navigation lock to be released, if it's currently held.
 * No-op if the lock is not acquired.
 *
 * Not exposed in production builds by default.
 */
export async function waitForNavigationLockIfActive(): Promise<void> {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      await lockState.promise
    }
  }
}

/**
 * Called during page initialization to check if the page was loaded during an
 * instant navigation test (i.e. the test cookie is set). If so, sets up the
 * lock state so that:
 * 1. Client-side navigations during the instant scope also block dynamic data
 * 2. When the lock is released, a refresh is triggered to fetch dynamic data
 *
 * Returns true if the page was loaded during an instant navigation test.
 *
 * Not exposed in production builds by default.
 */
export function initializeInstantNavigationTestState(): boolean {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (!document.cookie.includes(NEXT_INSTANT_TEST_COOKIE + '=')) {
      return false
    }

    // Set the MPA flag so we know to trigger a refresh when the lock is released
    mpaLockedStateNeedsRefresh = true

    // Also acquire the in-memory lock so client-side navigations during the
    // instant scope also block dynamic data
    if (lockState === null) {
      let resolve: () => void
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      lockState = { promise, resolve: resolve! }
    }

    return true
  }
  return false
}
