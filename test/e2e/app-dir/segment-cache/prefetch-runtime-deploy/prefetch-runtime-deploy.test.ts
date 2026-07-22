import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// Pins the deployed contract for runtime prefetching of `use cache: private`
// content, which the blanket "flakey" entries for the prefetch-runtime suite
// in test/deploy-tests-manifest.json leave unguarded:
//
// - request-input-derived content (cookies) is delivered by the prefetch and
//   the navigation commits without any request at click time;
// - content that requires executing the scope (entropy, like a draft id) is
//   generated fresh per session by the runtime prefetch, not replayed from
//   the build-time sample.
//
// Both behaviors were verified against real Vercel deployments of this
// fixture (including with `cachedNavigations: 'allow-runtime'` and
// `optimisticRouting: false`, and on the same canary v0 runs), driving the
// suite with NEXT_TEST_DEPLOY_URL. Note the `x-vercel-cache: HIT` /
// `PRERENDER` labels on these responses are not evidence the function was
// skipped: the bodies carry per-request fresh content either way.

describe('runtime prefetch of private cache content', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  async function prefetchThenVisitComposer(): Promise<{
    cookieValue: string
    draftId: string
    requestsAfterClick: string[]
  }> {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // A per-session unique cookie value: neither the build-time sample nor a
    // CDN-cached response from an earlier request can contain it.
    const flavor = `vanilla-${Math.random().toString(36).slice(2, 10)}`
    await browser.eval(`document.cookie = 'flavor=${flavor}; path=/'`)

    // Reveal the link and let its prefetches settle.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/composer"]'
      )
      await linkToggle.click()
    })

    // The navigation itself must be served from the prefetch cache: no
    // requests for the composer route after the click.
    const requestsAfterClick: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes('composer')) {
        requestsAfterClick.push(request.url())
      }
    })
    await browser.elementByCss('a[href="/composer"]').click()
    await retry(async () => {
      expect(await browser.elementById('cookie-value').text()).toBe(
        `Cookie: ${flavor}`
      )
    })

    return {
      cookieValue: (await browser.elementById('cookie-value').text()).replace(
        'Cookie: ',
        ''
      ),
      draftId: await browser.elementById('draft-id').text(),
      requestsAfterClick,
    }
  }

  it('serves cookie-derived private content from the prefetch', async () => {
    const { cookieValue, requestsAfterClick } =
      await prefetchThenVisitComposer()
    expect(cookieValue).toMatch(/^vanilla-/)
    expect(requestsAfterClick).toEqual([])
  })

  it('serves each session its own private-cached entropy', async () => {
    const first = await prefetchThenVisitComposer()
    const second = await prefetchThenVisitComposer()

    // Both navigations must be served from the prefetch cache AND carry
    // per-session entropy. Fresh entropy cannot be synthesized on the
    // client, so a prefetch pipeline that never executes the scope can
    // satisfy at most one of these: it either replays the build-time value
    // (same id for every session) or falls back to a navigation-time round
    // trip (not served from the prefetch).
    expect(first.requestsAfterClick).toEqual([])
    expect(second.requestsAfterClick).toEqual([])
    expect(first.draftId).toMatch(/^[0-9a-f]{12}$/)
    expect(second.draftId).toMatch(/^[0-9a-f]{12}$/)
    expect(second.draftId).not.toBe(first.draftId)
  })
})
