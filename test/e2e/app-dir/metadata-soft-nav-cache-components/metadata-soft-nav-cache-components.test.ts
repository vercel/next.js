import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// Regression test for GitHub #95268: with Cache Components + `partialPrefetching`,
// the metadata `<title>` is permanently dropped after a client-side navigation
// to a route with dynamic `generateMetadata` whose prefetch has already settled.
// The prefetch caches the route's App Shell, whose head does not include the
// dynamic title; the subsequent navigation must replace that prefetched head
// with the full head from the dynamic response. Previously it did not, so the
// title never appeared (only a hard reload fixed it).
describe('metadata-soft-nav-cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  it('applies dynamic metadata after navigating to an already-prefetched route', async () => {
    let page: Playwright.Page = null as any
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    expect(await browser.eval(() => document.title)).toBe('Home Default')

    // Reveal the link and let its prefetch fully settle (act waits for the
    // prefetch requests to complete). This caches the route's App Shell, whose
    // head does NOT include the dynamic metadata title.
    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/slow"]').click()
    })

    // Navigate to the now-prefetched route.
    await act(
      async () => {
        await browser.elementByCss('a[href="/slow"]').click()
      },
      { includes: 'Slow content' }
    )

    await browser.waitForElementByCss('#slow-content')

    // The title must resolve to the route's own metadata, merged with the
    // layout's template — not be permanently dropped to an empty string.
    await retry(async () => {
      expect(await browser.eval(() => document.title)).toBe('Slow Page | Site')
    })
  })

  it('does not blank a complete static title while its prefetch is in flight', async () => {
    let page: Playwright.Page = null as any
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    expect(await browser.eval(() => document.title)).toBe('Home Default')

    await act(async () => {
      // Let the route tree prefetch complete, but hold both prefetch responses
      // that contain the head: the App Shell response and the standalone
      // static head response. This reproduces a click that races an in-flight
      // static prefetch.
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/static-meta"]')
          .click()
      }, [
        { includes: 'Static Meta', kind: 'static', block: true },
        { includes: 'Static Meta', kind: 'runtime', block: true },
      ])

      // Hold the navigation response, too, so we can inspect the optimistic
      // state before either source of the destination head is delivered.
      await act(
        async () => {
          await browser.elementByCss('a[href="/static-meta"]').click()
        },
        { includes: 'Static meta content', block: true }
      )

      expect(await browser.eval(() => document.title)).toBe('Home Default')
    })

    await browser.waitForElementByCss('#static-meta-content')

    await retry(async () => {
      expect(await browser.eval(() => document.title)).toBe(
        'Static Meta | Site'
      )
    })
  })
})
