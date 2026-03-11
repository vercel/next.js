/**
 * Navigation lock for the Instant Navigation Testing API.
 *
 * This module is not meant to be used directly. It's exposed via a cookie-based
 * protocol intended to be driven by an e2e testing framework like Playwright:
 *
 *   async function instant(page, fn) {
 *     const context = page.context()
 *     const domain = new URL(page.url()).hostname
 *     await context.addCookies([{
 *       name: 'next-instant-navigation-testing',
 *       value: '1',
 *       domain,
 *       path: '/',
 *     }])
 *     try {
 *       return await fn()
 *     } finally {
 *       await context.clearCookies({
 *         name: 'next-instant-navigation-testing',
 *       })
 *     }
 *   }
 *
 *   // Usage in a test:
 *   await instant(page, async () => {
 *     await page.click('a[href="/product"]')
 *     await expect(page.locator('[data-testid="loading"]')).toBeVisible()
 *   })
 *
 * Next.js never writes to the cookie — it only reads and listens for changes
 * via the CookieStore API's `change` event.
 *
 * When the lock is acquired:
 * - Routes without a prefetch cache hit will wait for prefetch to complete
 *   before navigating.
 * - Routes with a prefetch cache hit will wait before writing dynamic data
 *   into the UI.
 *
 * For MPA navigations (page reload, full page load):
 * - The cookie tells the server to render only the static shell.
 * - The page hydrates from a static resume payload while the in-memory lock
 *   prevents the dynamic continuation from writing into the UI.
 * - When the lock is released (cookie cleared), the page reloads to fetch
 *   the full dynamic response.
 *
 * This allows tests to assert on the prefetched UI state before dynamic
 * content streams in. Network requests are not blocked — they proceed in
 * parallel while the lock is held.
 *
 * All functions in this module are wrapped in checks for the testing API,
 * which is not exposed in production builds by default. This ensures the code
 * is dead code eliminated unless explicitly enabled.
 */

import { NEXT_INSTANT_TEST_COOKIE } from '../app-router-headers'
import { refreshOnInstantNavigationUnlock } from '../use-action-queue'

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

/**
 * Starts listening for changes to the instant navigation test cookie via the
 * CookieStore API. When the cookie is added (by the test framework), the
 * in-memory lock is acquired. When the cookie is deleted, the lock is released.
 *
 * For MPA navigations, if the page was served as a static shell
 * (self.__next_instant_test is set) but the cookie is already gone by the
 * time this runs, it means the test framework cleared the cookie during the
 * page transition. In that case we reload immediately to fetch the full
 * dynamic response.
 *
 * This should be called once during page initialization.
 */
export function startListeningForInstantNavigationCookie(): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    // If the server served a static shell (indicated by the injected global)
    // but the cookie is already gone, the test framework cleared it during
    // the MPA page transition before we could register a listener. Reload
    // to fetch the full dynamic page.
    if (self.__next_instant_test) {
      if (typeof cookieStore !== 'undefined') {
        cookieStore.get(NEXT_INSTANT_TEST_COOKIE).then((cookie) => {
          if (!cookie) {
            window.location.reload()
          }
        })
      }
      acquireLock()
    }

    if (typeof cookieStore === 'undefined') {
      return
    }
    cookieStore.addEventListener('change', (event: CookieChangeEvent) => {
      // Check if our cookie was added
      for (const cookie of event.changed) {
        if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
          if (lockState !== null) {
            console.error(
              'Navigation lock already acquired. Concurrent locks ' +
                'are not allowed. Did you forget to release the ' +
                'previous lock?'
            )
            return
          }
          acquireLock()
          return
        }
      }

      // Check if our cookie was deleted
      for (const cookie of event.deleted) {
        if (cookie.name === NEXT_INSTANT_TEST_COOKIE) {
          if (lockState !== null) {
            lockState.resolve()
            lockState = null
          }
          refreshOnInstantNavigationUnlock()
          return
        }
      }
    })
  }
}

/**
 * Returns true if the navigation lock is currently active. Checks the cookie
 * rather than in-memory lockState because the cookie survives across MPA
 * navigations (page reloads). Returns false when the testing API is disabled.
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
 */
export async function waitForNavigationLockIfActive(): Promise<void> {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    if (lockState !== null) {
      await lockState.promise
    }
  }
}
