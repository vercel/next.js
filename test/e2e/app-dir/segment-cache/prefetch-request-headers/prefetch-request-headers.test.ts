import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// This test asserts on the exact headers that the router sends with each
// prefetch request. Normally we'd avoid asserting on wire-format details like
// this, but these headers are a contract between Next.js and the
// infrastructure deployed in front of the application server (e.g. a CDN or
// proxy), which uses them to decide how to handle prefetch requests. The
// headers themselves are the behavior under test.

type CapturedRequest = {
  url: string
  headers: Record<string, string>
}

// The router request headers that are part of the contract. A request must
// send exactly the expected subset of these — a missing expected header and
// an unexpected extra header are both errors.
const ROUTER_HEADERS = [
  'next-router-prefetch',
  'next-router-segment-prefetch',
  'purpose',
  'prefer',
] as const

function expectRouterHeaders(
  request: CapturedRequest,
  expected: Record<string, unknown>
) {
  const actual: Record<string, string> = {}
  for (const name of ROUTER_HEADERS) {
    const value = request.headers[name]
    if (value !== undefined) {
      actual[name] = value
    }
  }
  expect(actual).toEqual(expected)
}

describe('segment cache (prefetch request headers)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  async function setup() {
    const captured: Array<CapturedRequest> = []
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        // Passively record every outgoing router request so we can assert on
        // its headers. This doesn't interfere with router-act's interception,
        // which controls response timing.
        page.on('request', (request) => {
          const headers = request.headers()
          if (headers['rsc'] !== undefined) {
            captured.push({ url: request.url(), headers })
          }
        })
        act = createRouterAct(page, { includeAppShellRequests: true })
      },
    })
    return { browser, act: act!, captured }
  }

  it(
    'marks all prefetches of a route without Partial Prefetching as ' +
      'shell prefetches (return=minimal)',
    async () => {
      const { browser, act, captured } = await setup()

      // Reveal the link to /default. The route has no Partial Prefetching
      // opt-ins, so its static data is prefetched with a route tree request
      // followed by per-segment requests. None of these requests may trigger
      // regeneration of a partial fallback, so all of them are marked
      // `return=minimal`.
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/default"]')
          .click()
      })

      let sawTreeRequest = false
      let sawSegmentRequest = false
      for (const request of captured) {
        if (request.headers['next-router-segment-prefetch'] === '/_tree') {
          // Route tree prefetch
          sawTreeRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '1',
            'next-router-segment-prefetch': '/_tree',
            purpose: 'prefetch',
            prefer: 'return=minimal',
          })
        } else {
          // Static per-segment prefetch
          sawSegmentRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '1',
            'next-router-segment-prefetch': expect.any(String),
            purpose: 'prefetch',
            prefer: 'return=minimal',
          })
        }
      }
      expect(sawTreeRequest).toBe(true)
      expect(sawSegmentRequest).toBe(true)
    }
  )

  it(
    'marks Shell-phase prefetches of a Partial Prefetching route as ' +
      'return=minimal, and Speculative-phase prefetches as ' +
      'return=representation',
    async () => {
      const { browser, act, captured } = await setup()

      // Reveal the link to /pp, which opted into Partial Prefetching
      // (`instant`) and eager prefetching. The prefetch happens in phases:
      //
      // - The route tree request and the App Shell request (Shell phase)
      //   fetch the route's reusable shell. They must not trigger
      //   regeneration of a partial fallback, so they're `return=minimal`.
      // - The per-segment requests (Speculative phase) fetch the full static
      //   output of the route, and are `return=representation`.
      await act(async () => {
        await browser.elementByCss('input[data-link-accordion="/pp"]').click()
      })

      let sawTreeRequest = false
      let sawAppShellRequest = false
      let sawSegmentRequest = false
      for (const request of captured) {
        if (request.headers['next-router-segment-prefetch'] === '/_tree') {
          // Route tree prefetch
          sawTreeRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '1',
            'next-router-segment-prefetch': '/_tree',
            purpose: 'prefetch',
            prefer: 'return=minimal',
          })
        } else if (request.headers['next-router-prefetch'] === '3') {
          // App Shell prefetch
          sawAppShellRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '3',
            purpose: 'prefetch',
            prefer: 'return=minimal',
          })
        } else {
          // Static per-segment prefetch
          sawSegmentRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '1',
            'next-router-segment-prefetch': expect.any(String),
            purpose: 'prefetch',
            prefer: 'return=representation',
          })
        }
      }
      expect(sawTreeRequest).toBe(true)
      expect(sawAppShellRequest).toBe(true)
      expect(sawSegmentRequest).toBe(true)
    }
  )

  it('marks runtime prefetches as return=representation', async () => {
    const { browser, act, captured } = await setup()

    // Reveal the link to /runtime, which opted into runtime prefetching
    // (`prefetch = 'allow-runtime'`). The link is rendered with
    // prefetch={true}; because the route opted into Partial Prefetching, the
    // full prefetch is performed with the Cache Components strategy instead
    // of a legacy dynamic request. During the Speculative phase, the dynamic
    // parts of the page are prefetched with a runtime request, which may
    // trigger regeneration of a partial fallback (`return=representation`).
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/runtime"]')
        .click()
    })

    let sawTreeRequest = false
    let sawAppShellRequest = false
    let sawRuntimeRequest = false
    for (const request of captured) {
      if (request.headers['next-router-segment-prefetch'] === '/_tree') {
        // Route tree prefetch
        sawTreeRequest = true
        expectRouterHeaders(request, {
          'next-router-prefetch': '1',
          'next-router-segment-prefetch': '/_tree',
          purpose: 'prefetch',
          prefer: 'return=minimal',
        })
      } else if (request.headers['next-router-prefetch'] === '3') {
        // App Shell prefetch (Shell phase)
        sawAppShellRequest = true
        expectRouterHeaders(request, {
          'next-router-prefetch': '3',
          purpose: 'prefetch',
          prefer: 'return=minimal',
        })
      } else if (request.headers['next-router-prefetch'] === '2') {
        // Runtime prefetch
        sawRuntimeRequest = true
        expectRouterHeaders(request, {
          'next-router-prefetch': '2',
          purpose: 'prefetch',
          prefer: 'return=representation',
        })
      } else {
        // Static per-segment prefetch (Speculative phase)
        expectRouterHeaders(request, {
          'next-router-prefetch': '1',
          'next-router-segment-prefetch': expect.any(String),
          purpose: 'prefetch',
          prefer: 'return=representation',
        })
      }
    }
    expect(sawTreeRequest).toBe(true)
    expect(sawAppShellRequest).toBe(true)
    expect(sawRuntimeRequest).toBe(true)
  })

  it(
    'does not mark a legacy full prefetch (prefetch={true} without ' +
      'Partial Prefetching)',
    async () => {
      const { browser, act, captured } = await setup()

      // Reveal the link to /legacy, which is rendered with prefetch={true}.
      // The route has no Partial Prefetching opt-ins, so this performs a
      // legacy "full" dynamic prefetch — essentially a navigation request
      // that happens ahead of time. Because it must be indistinguishable from
      // the navigation request it stands in for, it doesn't get the purpose
      // or prefer headers. (The route tree request that precedes it is a
      // normal shell prefetch.)
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/legacy"]')
          .click()
      })

      let sawTreeRequest = false
      let sawFullPrefetchRequest = false
      for (const request of captured) {
        if (request.headers['next-router-segment-prefetch'] === '/_tree') {
          // Route tree prefetch
          sawTreeRequest = true
          expectRouterHeaders(request, {
            'next-router-prefetch': '1',
            'next-router-segment-prefetch': '/_tree',
            purpose: 'prefetch',
            prefer: 'return=minimal',
          })
        } else {
          // Legacy full prefetch. Sends no router headers at all.
          sawFullPrefetchRequest = true
          expectRouterHeaders(request, {})
        }
      }
      expect(sawTreeRequest).toBe(true)
      expect(sawFullPrefetchRequest).toBe(true)
    }
  )

  it('does not mark navigation requests', async () => {
    const { browser, act, captured } = await setup()

    // Reveal the link to /nav-target, which is rendered with prefetch={false},
    // so nothing is prefetched. (Not wrapped in `act` because no requests are
    // expected.)
    await browser
      .elementByCss('input[data-link-accordion="/nav-target"]')
      .click()

    // Navigate. The navigation request gets neither the purpose nor the
    // prefer header.
    captured.length = 0
    await act(
      async () => {
        await browser.elementByCss('a[href="/nav-target"]').click()
      },
      { includes: 'Nav target content' }
    )
    expect(await browser.elementById('nav-target-dynamic').text()).toContain(
      'Nav target content'
    )

    expect(captured.length).toBeGreaterThan(0)
    for (const request of captured) {
      // Navigation request. Sends no router headers at all.
      expectRouterHeaders(request, {})
    }
  })
})
