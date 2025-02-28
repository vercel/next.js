import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache (basic tests)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  it('navigate before any data has loaded into the prefetch cache', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    await act(
      async () => {
        // Reveal the link to trigger a prefetch, but block the responses.
        const link = await act(async () => {
          const reveal = await browser.elementByCss('input[type="checkbox"]')
          await reveal.click()
          return await browser.elementByCss('a')
        }, 'block')

        // While the prefetches are blocked, navigate to the test page.
        await act(
          async () => {
            // Navigate to the test page
            await link.click()
          },
          {
            includes: 'Dynamic in nav',
          }
        )

        // The static and dynamic content appears simultaneously because everything
        // was fetched as part of the same navigation request.
        const nav = await browser.elementById('nav')
        expect(await nav.innerHTML()).toMatchInlineSnapshot(
          `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div data-streaming-text-dynamic="Dynamic in nav">Dynamic in nav</div></div>"`
        )
      },
      // Although the blocked prefetches are allowed to continue when we exit
      // the outer `act` scope, they were canceled when we navigated to the new
      // page. So there should be no additional requests in the outer
      // `act` scope.
      'no-requests'
    )
  })

  it('navigate with prefetched data', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger a prefetch, but block the responses.
    const link = await act(async () => {
      const reveal = await browser.elementByCss('input[type="checkbox"]')
      await reveal.click()
      return await browser.elementByCss('a')
    })

    // Navigate to the test page
    await act(
      async () => {
        await link.click()

        // Because we haven't exited the `act` scope yet, no new data has been
        // received, but we're still able to immediately render the static
        // content because it was prefetched.
        const nav = await browser.elementById('nav')
        expect(await nav.innerHTML()).toMatchInlineSnapshot(
          `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div>Loading... [Dynamic in nav]</div></div>"`
        )
      },
      // The dynamic data streams in after the loading state
      { includes: 'Dynamic in nav' }
    )

    const nav = await browser.elementById('nav')
    await browser.elementByCss('[data-streaming-text-dynamic="Dynamic in nav"]')
    expect(await nav.innerHTML()).toMatchInlineSnapshot(
      `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div data-streaming-text-dynamic="Dynamic in nav">Dynamic in nav</div></div>"`
    )
  })

  it('navigate to page with lazily-generated (not at build time) static param', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/lazily-generated-params', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger a prefetch.
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    const link = await act(
      async () => {
        await reveal.click()
        return await browser.elementByCss('a')
      },
      { includes: 'target-page-with-lazily-generated-param' }
    )

    // Navigate to the test page
    await act(
      async () => {
        await link.click()

        // We should be able to render the page with the dynamic param, because
        // it is lazily generated
        const target = await browser.elementById(
          'target-page-with-lazily-generated-param'
        )
        expect(await target.innerHTML()).toMatchInlineSnapshot(
          `"Param: some-param-value"`
        )
      },
      // No additional requests were required, because everything was prefetched
      'no-requests'
    )
  })

  it('prefetch interception route', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/interception/feed', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger a prefetch.
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    const link = await act(
      async () => {
        await reveal.click()
        return await browser.elementByCss('a')
      },
      { includes: 'intercepted-photo-page' }
    )

    // Navigate to the test page
    await act(
      async () => {
        await link.click()

        // The page should render immediately because it was prefetched
        const div = await browser.elementById('intercepted-photo-page')
        expect(await div.innerHTML()).toBe('Intercepted photo page')
      },
      // No additional requests were required, because everything was prefetched
      'no-requests'
    )
  })

  it('skips dynamic request if prefetched data is fully static', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/fully-static', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger a prefetch.
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    const link = await act(
      async () => {
        await reveal.click()
        return await browser.elementByCss('a[href="/fully-static/target-page"]')
      },
      { includes: 'Target' }
    )

    await act(
      async () => {
        await link.click()

        // The page should render immediately because it was prefetched.
        const div = await browser.elementById('target-page')
        expect(await div.innerHTML()).toBe('Target')
      },
      // No additional requests were required, because everything was prefetched
      'no-requests'
    )
  })

  it('skips static layouts during partially static navigation', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/partially-static', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    const layoutMarkerId = 'static-layout'
    const layoutMarkerContent = 'Static layout'

    // Reveal the link to trigger a prefetch.
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    const link = await act(
      async () => {
        await reveal.click()
        return await browser.elementByCss(
          'a[href="/partially-static/target-page"]'
        )
      },
      // The static layout should not be included in the dynamic response,
      // because it was already prefetched.
      { includes: layoutMarkerContent }
    )

    await act(async () => {
      await link.click()

      // The static layout and the loading state of the dynamic page should
      // render immediately because they were prefetched.
      const layoutMarker = await browser.elementById(layoutMarkerId)
      expect(await layoutMarker.innerHTML()).toBe('Static layout')
      const dynamicDiv = await browser.elementById('dynamic-page')
      expect(await dynamicDiv.innerHTML()).toBe('Loading...')
    }, [
      // The dynamic page is included in the dynamic response.
      { includes: 'Dynamic page' },

      // The static layout should not be included in the dynamic response,
      // because it was already prefetched.
      { includes: layoutMarkerContent, block: 'reject' },
    ])

    // The dynamic content has streamed in.
    const dynamicDiv = await browser.elementById('dynamic-page')
    expect(await dynamicDiv.innerHTML()).toBe('Dynamic page')
  })
})
