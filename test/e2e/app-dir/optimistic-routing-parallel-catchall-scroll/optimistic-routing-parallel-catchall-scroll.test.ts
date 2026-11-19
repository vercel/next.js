import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

// Reporter's shape: an active parallel catch-all slot nested under [locale].
// app/[locale]/(main)/@desktopNav/[...catchAll]/page.tsx
// app/[locale]/(main)/f/[slug]/page.tsx
describe('optimistic-routing-parallel-catchall-scroll', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  async function setup() {
    let act!: ReturnType<typeof createRouterAct>
    const navigationRequests = new Map<string, number>()
    const navigationRouterStates = new Map<string, string>()
    const browser = await next.browser('/en-de/f/men', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          const headers = request.headers()
          if (headers.rsc === undefined) return
          if (headers['next-router-prefetch'] !== undefined) return
          const pathname = new URL(request.url()).pathname
          navigationRequests.set(
            pathname,
            (navigationRequests.get(pathname) ?? 0) + 1
          )
          if (!navigationRouterStates.has(pathname)) {
            navigationRouterStates.set(
              pathname,
              decodeURIComponent(headers['next-router-state-tree'] ?? '')
            )
          }
        })
      },
    })
    // Teach the known-route trie the /[locale]/f/[slug] pattern from a
    // different URL, so its catch-all slot param is 'f/women'.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/en-de/f/women"]')
        .click()
    })
    return { browser, act, navigationRequests, navigationRouterStates }
  }

  it('scrolls to top on a locale replace that stays on /f/[slug]', async () => {
    const { browser, act, navigationRequests } = await setup()

    await browser.eval('window.scrollTo(0, document.body.scrollHeight)')
    expect(await browser.eval('window.scrollY')).toBeGreaterThan(0)

    await act(async () => {
      await browser.elementById('switch-locale').click()
    })

    expect(await browser.elementById('heading').text()).toBe(
      'Featured de-de/herren'
    )
    expect(await browser.elementById('desktop-nav').text()).toBe('Nav f/herren')
    expect({
      navigationRequests: navigationRequests.get('/de-de/f/herren'),
      scrollY: await browser.eval('window.scrollY'),
    }).toEqual({ navigationRequests: 1, scrollY: 0 })
  })

  it('predicts the parallel catch-all param from the URL', async () => {
    const { browser, act, navigationRouterStates } = await setup()

    await act(async () => {
      await browser.elementById('switch-locale').click()
    })

    expect(await browser.elementById('desktop-nav').text()).toBe('Nav f/herren')
    // The navigation request is sent with the predicted route tree. The slot's
    // catch-all is read from the target URL instead of being reused from the
    // URL the pattern was learned from.
    const routerState = navigationRouterStates.get('/de-de/f/herren')
    expect(routerState).toContain('["locale","de-de","d"')
    expect(routerState).toContain('["slug","herren","d"')
    expect(routerState).toContain('["catchAll","f/herren","c"')
  })
})
