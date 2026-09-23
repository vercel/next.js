import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// The App Shell is keyed by root params so that a locale-aware (etc.) shell can
// still be reused across navigations. But a shell should only vary on the root
// params it actually reads — keying it on root params it never touches stores
// redundant copies and misses cache hits.
//
// This fixture's root layout reads only `lang`; `region` is a root param that
// is read only below the shell boundary. So the shell for
// /[lang]/[region]/posts varies on `lang` but is identical across `region`.
//
// The app uses Partial Prefetching, so revealing a link prefetches only the
// shared shell — no per-link Speculative prefetch. Each reveal is therefore
// exactly one shell prefetch (when the shell isn't already cached) or no
// requests at all. We pass `{ includeAppShellRequests: true }` so router-act
// asserts on App Shell requests (next-router-prefetch: '3') instead of ignoring
// them.
describe('App Shell varies only on the root params it reads', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped in dev (prefetching is disabled)', () => {})
    return
  }

  it('reuses the shell across an unread root param, but refetches across a read one', async () => {
    let page: Playwright.Page
    // Start on the one statically-generated route.
    const browser = await next.browser('/en/us', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Prime the shared shell for /en/uk/posts. The shell render reads `lang`
    // ('en') but not `region`.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/en/uk/posts/1"]')
          .click()
      },
      { includes: 'App shell for posts' }
    )

    // Reveal /en/gb/posts/1 — SAME lang, DIFFERENT region. The shell does not
    // read `region`, so the shell cached for /en/uk is reusable: this reveal
    // should prefetch nothing.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/en/gb/posts/1"]')
        .click()
    }, 'no-requests')

    // Reveal /fr/uk/posts/1 — DIFFERENT lang. The shell DOES read `lang`, so it
    // must NOT be reused: a fresh shell prefetch fires. This guards against
    // over-narrowing (dropping a root param the shell actually reads).
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/fr/uk/posts/1"]')
          .click()
      },
      { includes: 'App shell for posts' }
    )
  })
})
