/**
 * Minimal interfaces for Playwright's Page and BrowserContext. We use
 * structural types rather than importing from a specific Playwright package
 * so this works with any version of playwright, playwright-core, or
 * @playwright/test.
 */
interface PlaywrightBrowserContext {
  addCookies(
    cookies: Array<{
      name: string
      value: string
      url?: string
      domain?: string
      path?: string
    }>
  ): Promise<void>
  clearCookies(options?: { name?: string }): Promise<void>
}

interface PlaywrightPage {
  url(): string
  context(): PlaywrightBrowserContext
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
 *
 * If the page is already loaded, the URL is inferred
 * automatically. For a fresh page (before any navigation), pass
 * `baseURL` so the cookie can be scoped to the correct domain:
 *
 *   await instant(page, async () => {
 *     await page.goto(url)
 *     // ...
 *   }, { baseURL: 'http://localhost:3000' })
 */
export async function instant<T>(
  page: PlaywrightPage,
  fn: () => Promise<T>,
  options?: { baseURL?: string }
): Promise<T> {
  // Acquire the lock by setting the cookie via the browser context. This
  // ensures the cookie is present even on the very first navigation.
  // The cookie triggers the CookieStore change event in
  // navigation-testing-lock.ts, which acquires the in-memory navigation lock.
  const { hostname } = new URL(resolveURL(page, options))
  await page
    .context()
    .addCookies([
      { name: INSTANT_COOKIE, value: '1', domain: hostname, path: '/' },
    ])
  try {
    return await fn()
  } finally {
    // Release the lock by clearing the cookie. For SPA navigations, this
    // triggers the CookieStore change event which resolves the in-memory
    // lock. For MPA navigations (reload, plain anchor), the listener in
    // app-bootstrap.ts triggers a page reload to fetch dynamic data.
    await page.context().clearCookies({ name: INSTANT_COOKIE })
  }
}

/**
 * Resolves the URL to scope the instant navigation cookie to. Prefers
 * an explicit `baseURL` option, then falls back to the page's current URL.
 * Throws a descriptive error if neither is available (e.g. fresh page
 * before any navigation).
 */
function resolveURL(
  page: PlaywrightPage,
  options?: { baseURL?: string }
): string {
  const url = options?.baseURL ?? page.url()
  if (url && url !== 'about:blank') {
    return url
  }
  const error = new Error(
    `Could not infer the base URL of the application.

instant() needs to know the base URL so it can configure the
browser before the first page load. If the page is already
loaded, the base URL is detected automatically.
Otherwise, you can fix this in one of two ways:

1. Pass a baseURL option:

  await instant(page, async () => {
    await page.goto('http://localhost:3000')
    // ...
  }, { baseURL: 'http://localhost:3000' })

  Tip: If you use baseURL in your Playwright config, you can
  get it from the test fixture:

    test('my test', async ({ page, baseURL }) => {
      await instant(page, async () => {
        // ...
      }, { baseURL })
    })

2. Navigate to a page before calling instant():

  await page.goto('http://localhost:3000')
  await instant(page, async () => {
    // ...
  })`
  )
  // Remove resolveURL and instant from the stack trace so the error
  // points at the caller's code.
  Error.captureStackTrace(error, instant)
  throw error
}
