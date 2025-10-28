import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { waitFor } from 'next-test-utils'

describe('segment cache (basic tests)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('ppr is disabled', () => {})
    return
  }

  it('navigate before any data has loaded into the prefetch cache', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
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
      beforePageLoad(page) {
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

  // TODO(cache-components): With `cacheComponents` enabled, this test is outdated, because
  // we no longer put the param values in the prefetched RSC response. You'd have to opt into runtime
  // prefetching for this test to pass until we ship the optimization that would mark this as fully static
  // if you don't reference any dynamic params in the server components.
  it.skip('navigate to page with lazily-generated (not at build time) static param', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/lazily-generated-params', {
      beforePageLoad(page) {
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
      beforePageLoad(page) {
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

  it('prefetch interception route with params', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/interception-with-params/feed', {
      beforePageLoad(page) {
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
        expect(await div.innerHTML()).toBe('Intercepted photo page for id "1"')
      },
      // No additional requests were required, because everything was prefetched
      'no-requests'
    )
  })

  it('skips dynamic request if prefetched data is fully static', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/fully-static', {
      beforePageLoad(page) {
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
      beforePageLoad(page) {
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

  it('refreshes page segments when navigating to the exact same URL as the current location', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/same-page-nav', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    const linkWithNoHash = await browser.elementByCss(
      'a[href="/same-page-nav"]'
    )
    const linkWithHashA = await browser.elementByCss(
      'a[href="/same-page-nav#hash-a"]'
    )
    const linkWithHashB = await browser.elementByCss(
      'a[href="/same-page-nav#hash-b"]'
    )

    async function readRandomNumberFromPage() {
      const randomNumber = await browser.elementById('random-number')
      return await randomNumber.textContent()
    }

    // Navigating to the same URL should refresh the page
    const randomNumber = await readRandomNumberFromPage()
    await act(async () => {
      await linkWithNoHash.click()
    }, [
      {
        includes: 'random-number',
      },
      {
        // Only the page segments should be refreshed, not the layouts.
        // TODO: We plan to change this in the future.
        block: 'reject',
        includes: 'same-page-nav-layout',
      },
    ])
    const randomNumber2 = await readRandomNumberFromPage()
    expect(randomNumber2).not.toBe(randomNumber)

    // Navigating to a different hash should *not* refresh the page
    await act(async () => {
      await linkWithHashA.click()
    }, 'no-requests')
    expect(await readRandomNumberFromPage()).toBe(randomNumber2)

    // Navigating to the same hash again should refresh the page
    await act(
      async () => {
        await linkWithHashA.click()
      },
      {
        includes: 'random-number',
      }
    )
    const randomNumber3 = await readRandomNumberFromPage()
    expect(randomNumber3).not.toBe(randomNumber2)

    // Navigating to a different hash should *not* refresh the page
    await act(async () => {
      await linkWithHashB.click()
    }, 'no-requests')
    expect(await readRandomNumberFromPage()).toBe(randomNumber3)
  })

  it('does not throw an error when navigating to a page with a server action', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/with-server-action', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger a prefetch.
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    const link = await act(
      async () => {
        await reveal.click()
        return await browser.elementByCss(
          'a[href="/with-server-action/target-page"]'
        )
      },
      { includes: 'Target' }
    )

    await act(
      async () => {
        await link.click()

        // The page should render immediately because it was prefetched, and it
        // should not throw an error.
        const form = await browser.elementById('target-page')
        expect(await form.innerHTML()).toBe('Target')
      },
      // No additional requests were required, because everything was prefetched
      'no-requests'
    )
  })

  it('does not cause infinite loop with cacheLife("seconds")', async () => {
    let requestCount = 0

    const browser = await next.browser('/cache-life-seconds-test', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = request.url()
          if (url.includes('/cache-life-seconds') && url.includes('_rsc')) {
            requestCount++
          }
        })
      },
    })

    // Reveal the link to trigger a prefetch
    const reveal = await browser.elementByCss('input[type="checkbox"]')
    await reveal.click()

    // Wait for the link to appear
    const link = await browser.elementByCss('a[href="/cache-life-seconds"]')

    // Give the prefetch a moment to potentially start looping
    await waitFor(500)

    // Check that we haven't made excessive requests during prefetch
    expect(requestCount).toBeLessThan(10)

    // Now navigate to the page to ensure it works correctly
    await link.click()

    // Wait for the page to load
    const page = await browser.elementById('cache-life-seconds-page')
    const content = await page.textContent()
    expect(content).toContain('Cache Life Seconds Page')
  })
})
