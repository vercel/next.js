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
      expires?: number
    }>
  ): Promise<void>
  cookies(urls?: string | string[]): Promise<
    Array<{ name: string; value: string; domain: string; path: string }>
  >
}

interface PlaywrightPage {
  url(): string
  context(): PlaywrightBrowserContext
}

const INSTANT_COOKIE = 'next-instant-navigation-testing'

// Track active instant() scopes per browser context so overlapping calls in the
// same context are rejected. Calls in separate contexts remain independent.
//
// We track this in-process rather than using cookie presence because a locked
// MPA load can race release and recreate the cookie after the scope has ended
// (see navigation-testing-lock.ts). Treating that stale cookie as an active
// scope would break later tests that reuse the context.
const contextsWithActiveScope = new WeakSet<PlaywrightBrowserContext>()

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
  const context = page.context()
  if (contextsWithActiveScope.has(context)) {
    throw new Error(
      'An instant() scope is already active. Nesting instant() ' +
        'calls is not supported. Did you forget to await the ' +
        'previous instant() call?'
    )
  }

  // Resolve the cookie's scope before touching any browser state, so misuse on
  // a fresh page (no baseURL and no prior navigation) fails with the
  // descriptive error from resolveURL rather than half-entering a scope.
  const scopeURL = resolveURL(page, options)
  const { hostname } = new URL(scopeURL)

  contextsWithActiveScope.add(context)
  try {
    // A completed scope can leave a stale cookie behind if an MPA cookie write
    // races release. Remove stale entries that apply to this application URL
    // before acquiring the next scope.
    await releaseInstantCookie(context, scopeURL)

    // Acquire the lock by setting the cookie via the browser context. This
    // ensures the cookie is present even on the very first navigation. The
    // cookie triggers the CookieStore change event in
    // navigation-testing-lock.ts, which acquires the in-memory navigation lock.
    await step('Acquire Instant Lock', () =>
      context.addCookies([
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
      await step('Release Instant Lock', () =>
        releaseInstantCookie(context, scopeURL)
      )
    }
  } finally {
    contextsWithActiveScope.delete(context)
  }
}

/**
 * Deletes instant cookie entries that apply to the application URL without
 * disturbing other cookie entries.
 *
 * Do not use `context.clearCookies({ name: INSTANT_COOKIE })` here. Playwright
 * implements a filtered clear by clearing the entire cookie jar and then
 * re-adding non-matching cookies. That briefly removes the application's own
 * cookies, so a render triggered by releasing the instant lock can observe a
 * request with no application cookies.
 *
 * Instead, read the entries that apply to the application URL and expire those
 * records individually. Next.js may update the value during capture, but it
 * preserves the domain and path.
 *
 * A locked MPA page load can recreate the cookie after deletion if its pending
 * write races release. Re-read and re-delete until it stays gone, with a fixed
 * retry bound so another actor cannot keep this loop running.
 */
async function releaseInstantCookie(
  context: PlaywrightBrowserContext,
  scopeURL: string
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const instantCookies = (await context.cookies(scopeURL)).filter(
      (cookie) => cookie.name === INSTANT_COOKIE
    )
    if (instantCookies.length === 0) {
      return
    }
    await context.addCookies(
      instantCookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        // A past expiry (Unix epoch seconds) deletes the cookie.
        expires: 1,
      }))
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
