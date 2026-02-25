/**
 * Minimal interface for Playwright's Page. We use a structural type rather than
 * importing from a specific Playwright package so this works with any version
 * of playwright, playwright-core, or @playwright/test.
 */
interface PlaywrightPage {
  evaluate<R, Arg>(pageFunction: (arg: Arg) => R, arg: Arg): Promise<R>
}

const INSTANT_COOKIE = 'next-instant-navigation-testing'

/**
 * Runs a function with instant navigation enabled. Within this scope,
 * navigations render the prefetched UI immediately and wait for the
 * callback to complete before streaming in dynamic data.
 *
 * Uses the cookie-based protocol: setting the cookie acquires the
 * navigation lock (via CookieStore change event), and clearing it
 * releases the lock.
 */
export async function instant<T>(
  page: PlaywrightPage,
  fn: () => Promise<T>
): Promise<T> {
  // Acquire the lock by setting the cookie from within the page context.
  // This triggers the CookieStore change event in navigation-testing-lock.ts,
  // which acquires the in-memory navigation lock.
  await page.evaluate((name) => {
    document.cookie = name + '=1; path=/'
  }, INSTANT_COOKIE)
  try {
    return await fn()
  } finally {
    // Release the lock by clearing the cookie. For SPA navigations, this
    // triggers the CookieStore change event which resolves the in-memory
    // lock. For MPA navigations (reload, plain anchor), the listener in
    // app-bootstrap.ts triggers a page reload to fetch dynamic data.
    await page.evaluate((name) => {
      document.cookie = name + '=; path=/; max-age=0'
    }, INSTANT_COOKIE)
  }
}
