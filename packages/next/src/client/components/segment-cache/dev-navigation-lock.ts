/**
 * Dev-only navigation lock for the Instant Navigation Testing API.
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
 * This allows tests to assert on the prefetched UI state before dynamic
 * content streams in. Network requests are not blocked - they proceed in
 * parallel while the lock is held.
 *
 * All functions in this module are wrapped in dev-mode checks so they get
 * dead code eliminated in production builds.
 */

type NavigationLockState = {
  promise: Promise<void>
  resolve: () => void
}

let lockState: NavigationLockState | null = null

/**
 * Acquires the navigation lock. While locked, navigations will wait for
 * prefetch tasks to complete before proceeding.
 *
 * Logs an error if the lock is already acquired (concurrent locks are not
 * allowed).
 *
 * Dev mode only.
 */
export function acquireNavigationLock(): void {
  if (process.env.NODE_ENV !== 'production') {
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
  }
}

/**
 * Releases the navigation lock. Any navigations that were waiting for
 * prefetch completion will now proceed with dynamic data fetching.
 *
 * No-op if the lock is not currently acquired.
 *
 * Dev mode only.
 */
export function releaseNavigationLock(): void {
  if (process.env.NODE_ENV !== 'production') {
    if (lockState !== null) {
      lockState.resolve()
      lockState = null
    }
  }
}

/**
 * Returns true if the navigation lock is currently acquired.
 *
 * Dev mode only. Always returns false in production.
 */
export function isNavigationLocked(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return lockState !== null
  }
  return false
}

/**
 * Waits for the navigation lock to be released, if it's currently held.
 * No-op if the lock is not acquired.
 *
 * Dev mode only.
 */
export async function waitForNavigationLockIfActive(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    if (lockState !== null) {
      await lockState.promise
    }
  }
}
