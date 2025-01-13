import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache (incremental opt in)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  async function testPrefetchDeduping(linkHref) {
    // This e2e test app is designed to verify that if you prefetch a link
    // multiple times, the prefetches are deduped by the client cache
    // (unless/until they become stale). It works by toggling the visibility of
    // the links and checking whether any prefetch requests are issued.
    //
    // Throughout the duration of the test, we collect all the prefetch requests
    // that occur. Then at the end we confirm there are no duplicates.
    const prefetches = new Map()
    const duplicatePrefetches = new Map()

    let act
    const browser = await next.browser('/', {
      async beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
        await page.route('**/*', async (route: Playwright.Route) => {
          const request = route.request()
          const isPrefetch =
            request.headerValue('rsc') !== null &&
            request.headerValue('next-router-prefetch') !== null
          if (isPrefetch) {
            const request = route.request()
            const headers = await request.allHeaders()
            const prefetchInfo = {
              href: new URL(request.url()).pathname,
              segment: headers['Next-Router-Segment-Prefetch'.toLowerCase()],
              base: headers['Next-Router-State-Tree'.toLowerCase()] ?? null,
            }
            const key = JSON.stringify(prefetchInfo)
            if (prefetches.has(key)) {
              duplicatePrefetches.set(key, prefetchInfo)
            } else {
              prefetches.set(key, prefetchInfo)
            }
          }
          route.continue()
        })
      },
    })

    // Each link on the test page has a checkbox that controls its visibility.
    // It starts off as hidden.
    const checkbox = await browser.elementByCss(
      `input[data-link-accordion="${linkHref}"]`
    )
    // Confirm the checkbox is not checked
    expect(await checkbox.isChecked()).toBe(false)

    // Click the checkbox to reveal the link and trigger a prefetch
    await act(async () => {
      await checkbox.click()
      await browser.elementByCss(`a[href="${linkHref}"]`)
    })

    // Toggle the visibility of the link. Prefetches are initiated on viewport,
    // so if the cache does not dedupe then properly, this test will detect it.
    await checkbox.click() // hide
    await checkbox.click() // show
    const link = await browser.elementByCss(`a[href="${linkHref}"]`)

    // Navigate to the target link
    await link.click()

    // Confirm the navigation happened
    await browser.elementById('page-content')
    expect(new URL(await browser.url()).pathname).toBe(linkHref)

    // Finally, assert there were no duplicate prefetches
    expect(prefetches.size).not.toBe(0)
    expect(duplicatePrefetches.size).toBe(0)
  }

  describe('multiple prefetches to same link are deduped', () => {
    it('page with PPR enabled', () => testPrefetchDeduping('/ppr-enabled'))
    it('page with PPR enabled, and has a dynamic param', () =>
      testPrefetchDeduping('/ppr-enabled/dynamic-param'))
    it('page with PPR disabled', () => testPrefetchDeduping('/ppr-disabled'))
    it('page with PPR disabled, and has a loading boundary', () =>
      testPrefetchDeduping('/ppr-disabled-with-loading-boundary'))
  })

  it(
    'prefetches a shared layout on a PPR-enabled route that was previously ' +
      'omitted from a non-PPR-enabled route',
    async () => {
      let act
      const browser = await next.browser('/mixed-fetch-strategies', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch for the PPR-disabled route first. This will not
      // include the /shared-layout/ segment, because it's inside the
      // loading boundary.
      await act(async () => {
        const checkbox = await browser.elementById('ppr-disabled')
        await checkbox.click()
      })

      // Then initiate a prefetch for the PPR-enabled route. This prefetch
      // should include the /shared-layout/ segment despite the presence of
      // the loading boundary, and despite the earlier non-PPR attempt
      await act(async () => {
        const checkbox = await browser.elementById('ppr-enabled')
        await checkbox.click()
      })

      // Navigate to the PPR-enabled route
      await act(async () => {
        const link = await browser.elementByCss('#ppr-enabled + a')
        await link.click()

        // If we prefetched all the segments correctly, we should be able to
        // reveal the page's loading state, before the server responds.
        await browser.elementById('page-loading-boundary')
      })
    }
  )
})
