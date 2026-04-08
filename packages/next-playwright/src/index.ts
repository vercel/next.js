import { step } from './step'

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
  cookies(): Promise<Array<{ name: string; value: string }>>
  clearCookies(options?: {
    name?: string
    domain?: string
    path?: string
  }): Promise<void>
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
 *
 * When `@playwright/test` is installed, acquire/release actions appear
 * as labeled steps in the Playwright UI.
 */
export async function instant<T>(
  page: PlaywrightPage,
  fn: () => Promise<T>,
  options?: { baseURL?: string }
): Promise<T> {
  // Check for nested instant() calls. The cookie is scoped to the browser
  // context, so we can detect nesting by checking if it's already set.
  const existingCookies = await page.context().cookies()
  if (existingCookies.some((c) => c.name === INSTANT_COOKIE)) {
    throw new Error(
      'An instant() scope is already active. Nesting instant() ' +
        'calls is not supported. Did you forget to await the ' +
        'previous instant() call?'
    )
  }

  // Acquire the lock by setting the cookie via the browser context. This
  // ensures the cookie is present even on the very first navigation.
  // The cookie triggers the CookieStore change event in
  // navigation-testing-lock.ts, which acquires the in-memory navigation lock.
  const { hostname } = new URL(resolveURL(page, options))
  await step('Acquire Instant Lock', () =>
    page.context().addCookies([
      {
        name: INSTANT_COOKIE,
        value: JSON.stringify([0, `p${Math.random()}`]),
        domain: hostname,
        path: '/',
      },
    ])
  )
  try {
    return await fn()
  } finally {
    // Release the lock by clearing the cookie. Next.js may have updated the
    // cookie value (e.g. from [0] to [1,null]) during the lock scope. We
    // clear by name to remove the cookie regardless of its current value or
    // which domain variant it was stored under.
    await step('Release Instant Lock', () =>
      page.context().clearCookies({ name: INSTANT_COOKIE })
    )
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
