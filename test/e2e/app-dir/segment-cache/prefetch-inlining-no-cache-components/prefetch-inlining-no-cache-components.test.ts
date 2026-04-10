import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

// Bit values from PrefetchHint enum (const enum, so we duplicate values here)
const PrefetchDisabled = 0b10000000000 // 1024

// FlightRouterState: [segment, children, ???, ???, prefetchHints?]
type FlightRouterState = [
  segment: string | string[],
  children: Record<string, FlightRouterState>,
  ...rest: any[],
]

/**
 * Recursively asserts that no segment in the FlightRouterState tree has the
 * PrefetchDisabled bit set.
 */
function assertNoPrefetchDisabled(state: FlightRouterState, path: string = '') {
  const segment = Array.isArray(state[0]) ? state[0][0] : state[0]
  const currentPath = path ? `${path}/${segment}` : segment || '(root)'
  const hints = state[4] ?? 0
  expect({
    segment: currentPath,
    prefetchDisabled: (hints & PrefetchDisabled) !== 0,
  }).toEqual({
    segment: currentPath,
    prefetchDisabled: false,
  })
  const children = state[1]
  if (children) {
    for (const key of Object.keys(children)) {
      assertNoPrefetchDisabled(children[key], currentPath)
    }
  }
}

/**
 * Fetches the route tree prefetch response. For static pages this returns a
 * RootTreePrefetch JSON object. For dynamic pages without cacheComponents it
 * returns a standard Flight response containing a FlightRouterState.
 */
async function fetchPrefetchResponse(next: any, pathname: string) {
  const res = await next.fetch(pathname, {
    headers: {
      RSC: '1',
      'Next-Router-Prefetch': '1',
      'Next-Router-Segment-Prefetch': '/_tree',
    },
  })
  const text = await res.text()
  const jsonStr = text.slice(text.indexOf(':') + 1)
  return JSON.parse(jsonStr)
}

describe('prefetch inlining without cacheComponents', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('prefetch hints are only computed during build', () => {})
    return
  }

  it('static page is prefetched with inlining', async () => {
    // Static pages always have hints computed during the build, regardless
    // of cacheComponents. Inlining should work normally.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/static-page"]')
          .click()
      },
      { includes: 'Static page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/static-page"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-static').text()).toBe(
      'Static page'
    )
  })

  it('dynamic page does not have PrefetchDisabled', async () => {
    // Without cacheComponents, dynamic pages have no static shell and
    // therefore no prerender pass to compute hints. The server should not
    // fall back to PrefetchDisabled — it should return a route tree with
    // no disabled segments so the client can still prefetch normally.
    const data = await fetchPrefetchResponse(next, '/dynamic-page')
    // The response is a Flight payload; the FlightRouterState is nested
    // inside it. Extract the router state from the flight data.
    const routerState: FlightRouterState = data.f[0][0]
    assertNoPrefetchDisabled(routerState)
  })

  it('dynamic edge page does not have PrefetchDisabled', async () => {
    // Edge runtime forces pages to be dynamic. Same as the non-edge
    // dynamic case: the route tree should not have PrefetchDisabled.
    const data = await fetchPrefetchResponse(next, '/dynamic-edge')
    const routerState: FlightRouterState = data.f[0][0]
    assertNoPrefetchDisabled(routerState)
  })
})
