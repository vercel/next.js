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
  cookies(): Promise<
    Array<{ name: string; value: string; domain: string; path: string }>
  >
}

interface PlaywrightPage {
  url(): string
  context(): PlaywrightBrowserContext
}

const INSTANT_COOKIE = 'next-instant-navigation-testing'

// Browser contexts that currently have an instant() scope executing. The
// instant cookie is scoped to the browser context, so the context is the
// natural granularity for the scope: two concurrent instant() calls on the same
// context share one cookie and genuinely conflict, whereas calls on different
// contexts (or different browsers) are independent and must not. Keying on the
// context object preserves that isolation while giving a race-free nesting
// signal.
//
// We track this in-process rather than inferring nesting from the cookie's
// presence: a locked page asynchronously re-writes the instant cookie on every
// MPA load (see navigation-testing-lock.ts), and that write can land right
// after a prior scope's release deletes it, resurrecting the cookie once the
// scope has already ended. Treating such a leftover as an active scope would
// turn a benign residue into a cascading failure across every later test that
// shares the browser context.
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
  const { hostname } = new URL(resolveURL(page, options))

  contextsWithActiveScope.add(context)
  try {
    // A completed prior scope on this context can leave the cookie behind (its
    // client-side release races an in-flight captured-cookie write from a
    // locked MPA page load; see the note above). No scope is active for this
    // context, so a present cookie is always stale here — clear it before
    // acquiring so a completed prior scope never blocks this one.
    await releaseInstantCookie(context)

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
      await step('Release Instant Lock', () => releaseInstantCookie(context))
    }
  } finally {
    contextsWithActiveScope.delete(context)
  }
}

/**
 * Deletes the instant cookie, leaving every other cookie untouched.
 *
 * We must NOT use `context.clearCookies({ name: INSTANT_COOKIE })` here.
 * Playwright implements a filtered `clearCookies` by clearing the ENTIRE cookie
 * jar and then re-adding the cookies that don't match the filter. That briefly
 * removes the application's own cookies too. Next.js reacts to the instant
 * cookie's deletion by immediately re-rendering, and if that render's request
 * races the empty window it observes none of the app's cookies (e.g. a
 * navigated page renders as if no cookies were set).
 *
 * Instead we read the instant cookie's stored entries (Next.js may have updated
 * the value, e.g. from [0] to [1,null], but preserves the domain and path) and
 * re-add each with a past expiry, which deletes only those entries without
 * disturbing the rest of the jar.
 *
 * A locked MPA page load can asynchronously re-write (resurrect) the cookie
 * just after we delete it: the client only stops writing once it observes the
 * deletion, an event that races the pending write. We therefore re-read and
 * re-delete until the cookie stays gone, bounded so a cookie that some other
 * actor keeps re-setting can't loop forever.
 */
async function releaseInstantCookie(
  context: PlaywrightBrowserContext
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const instantCookies = (await context.cookies()).filter(
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
