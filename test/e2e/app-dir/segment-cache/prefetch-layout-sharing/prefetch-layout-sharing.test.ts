import { nextTestSetup } from 'e2e-utils'
import { Playwright as NextBrowser } from '../../../../lib/next-webdriver'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('layout sharing in non-static prefetches', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('disabled in development', () => {})
    return
  }

  // Glossary:
  //
  // - A "full prefetch" is `<Link prefetch="unstable_forceStale">` (a.k.a old `prefetch={true}`, before cacheComponents).
  //  It includes cached and uncached IO.

  // - A "runtime prefetch" is the new `<Link prefetch={true}>` (only available in cacheComponents mode).
  //   It includes cached IO, and allows access to cookies/params/searchParams/"use cache: private", but excludes uncached IO.

  it('runtime prefetches should omit layouts that were already prefetched with a runtime prefetch', async () => {
    // Prefetches should re-use results from previous prefetches with the same fetch strategy.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a runtime prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/shared-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // should prefetch page one, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
      // Should not prefetch any dynamic content
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Reveal the link to trigger a runtime prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/shared-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should not prefetch the shared layout, because we already have it in the cache
      {
        includes: 'Cookie from layout: testValue',
        block: 'reject',
      },
      // should prefetch page two, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
      // Should not prefetch the dynamic content from either of them
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate to page two
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss(`a[href="/shared-layout/two"]`).click()
        },
        {
          // Temporarily block the navigation request.
          // The runtime-prefetched parts of the tree should be visible before it finishes.
          includes: 'Dynamic content',
          block: true,
        }
      )
      expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
      expect(await browser.elementByCss('h1').text()).toEqual('Page two')
      expect(await browser.elementById('cookie-value-layout').text()).toEqual(
        'Cookie from layout: testValue'
      )
      expect(await browser.elementById('cookie-value-page').text()).toEqual(
        'Cookie from page: testValue'
      )
    })

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('cookie-value-layout').text()).toEqual(
      'Cookie from layout: testValue'
    )
    expect(await browser.elementById('cookie-value-page').text()).toEqual(
      'Cookie from page: testValue'
    )
    expect(await browser.elementById('dynamic-content-layout').text()).toEqual(
      'Dynamic content from layout'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('full prefetches should omit layouts that were already prefetched with a full prefetch', async () => {
    // Prefetches should re-use results from previous prefetches with the same fetch strategy.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a full prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/shared-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // Should prefetch the dynamic content
      {
        includes: 'Dynamic content from page one',
      },
    ])

    // Reveal the link to trigger a full prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/shared-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should not prefetch the shared layout, because we already have it in the cache
      {
        includes: 'Dynamic content from layout',
        block: 'reject',
      },
      // Should prefetch the dynamic content
      {
        includes: 'Dynamic content from page two',
      },
    ])

    // Navigate to page two. We have everything in the cache, so we shouldn't issue any new requests
    await act(async () => {
      await browser.elementByCss(`a[href="/shared-layout/two"]`).click()
    }, 'no-requests')

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('dynamic-content-layout').text()).toEqual(
      'Dynamic content from layout'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('navigations should omit layouts that were already prefetched with a full prefetch', async () => {
    // A navigation is mostly equivalent to a full prefetch, so it should re-use results from full prefetches.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a full prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/shared-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // Should prefetch the dynamic content
      {
        includes: 'Dynamic content from page one',
      },
    ])

    // Reveal the link to trigger an auto prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="auto"][data-link-accordion="/shared-layout/two"]`
      )
      await linkToggle.click()
    })

    // Navigate to page two. We have everything in the cache, so we shouldn't issue any new requests
    await act(async () => {
      await browser.elementByCss(`a[href="/shared-layout/two"]`).click()
    }, [
      // Should not fetch the shared layout, because we already have it in the cache
      {
        includes: 'Dynamic content from layout',
        block: 'reject',
      },
      // Should fetch the dynamic content
      {
        includes: 'Dynamic content from page two',
      },
    ])

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('dynamic-content-layout').text()).toEqual(
      'Dynamic content from layout'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('runtime prefetches should omit layouts that were already prefetched with a full prefetch', async () => {
    // A prefetch should re-use layouts from past prefetches with more specific fetch strategies.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a full prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/shared-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // Should prefetch the dynamic content
      {
        includes: 'Dynamic content from page one',
      },
    ])

    // Reveal the link to trigger a runtime prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/shared-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should not prefetch the shared layout, because we already have it in the cache
      {
        includes: 'Cookie from layout: testValue',
        block: 'reject',
      },
      // should prefetch page two, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
      // Should not prefetch any dynamic content
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate to page two
    await act(async () => {
      await act(async () => {
        await browser.elementByCss(`a[href="/shared-layout/two"]`).click()
      }, [
        // Should not fetch the shared layout, because we already have a full prefetch of it
        {
          includes: 'Cookie from layout: testValue',
          block: 'reject',
        },
        {
          // Temporarily block the navigation request.
          // The runtime-prefetched parts of the tree should be visible before it finishes.
          includes: 'Dynamic content',
          block: true,
        },
      ])
      expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
      expect(await browser.elementByCss('h1').text()).toEqual('Page two')
      expect(await browser.elementById('cookie-value-layout').text()).toEqual(
        'Cookie from layout: testValue'
      )
      expect(await browser.elementById('cookie-value-page').text()).toEqual(
        'Cookie from page: testValue'
      )
    })

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('cookie-value-layout').text()).toEqual(
      'Cookie from layout: testValue'
    )
    expect(await browser.elementById('cookie-value-page').text()).toEqual(
      'Cookie from page: testValue'
    )
    expect(await browser.elementById('dynamic-content-layout').text()).toEqual(
      'Dynamic content from layout'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('full prefetches should include layouts that were only prefetched with a runtime prefetch', async () => {
    // A prefetch should NOT re-use layouts from past prefetches if they used a less specific fetch strategy.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a runtime prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/shared-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // should prefetch page one, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
      // Should not prefetch any dynamic content
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Reveal the link to trigger a full prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/shared-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should prefetch the shared layout, because we didn't prefetch it fully
      {
        includes: 'Dynamic content from layout',
      },
    ])

    // Navigate to page two. We have everything in the cache, so we shouldn't issue any new requests
    await act(async () => {
      await browser.elementByCss(`a[href="/shared-layout/two"]`).click()
    }, 'no-requests')

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('cookie-value-layout').text()).toEqual(
      'Cookie from layout: testValue'
    )
    expect(await browser.elementById('cookie-value-page').text()).toEqual(
      'Cookie from page: testValue'
    )
    expect(await browser.elementById('dynamic-content-layout').text()).toEqual(
      'Dynamic content from layout'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('full prefetches should omit layouts that were prefetched with a runtime prefetch and had no dynamic holes', async () => {
    // If a runtime prefetch gave us a complete segment with no dynamic holes left, then it's equivalent to a full prefetch.
    //
    // TODO: This doesn't work in all cases -- if any segment in a runtime prefetch was partial, we'll mark all of them as partial,
    // which means they can't be reused in a full prefetch or a navigation. So this only works if the dynaimic prefetch has no holes at all.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a runtime prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/runtime-prefetchable-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // should prefetch page one, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
    ])

    // Navigate to page one. It should have been completely prefetched by the runtime prefetch.
    await act(async () => {
      await browser
        .elementByCss(`a[href="/runtime-prefetchable-layout/one"]`)
        .click()
    }, 'no-requests')

    await browser.back()

    // Reveal the link to trigger a full prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="full"][data-link-accordion="/runtime-prefetchable-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should not prefetch the shared layout, because we already got a complete result for it.
      {
        includes: 'Cookie from layout',
        block: 'reject',
      },
      // Should fully prefetch the page, which we haven't prefetched before.
      {
        includes: 'Dynamic content from page two',
      },
    ])

    // Navigate to page two. We have everything in the cache, so we shouldn't issue any new requests
    await act(async () => {
      await browser
        .elementByCss(`a[href="/runtime-prefetchable-layout/two"]`)
        .click()
    }, 'no-requests')

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('cookie-value-layout').text()).toEqual(
      'Cookie from layout: testValue'
    )
    expect(await browser.elementById('cookie-value-page').text()).toEqual(
      'Cookie from page: testValue'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  it('navigations should omit layouts that were prefetched with a runtime prefetch and had no dynamic holes', async () => {
    // If a runtime prefetch gave us a complete segment with no dynamic holes left, then it's equivalent to a full prefetch.
    //
    // TODO: This doesn't work in all cases -- if any segment in a runtime prefetch was partial, we'll mark all of them as partial,
    // which means they can't be reused in a full prefetch or a navigation. So this only works if the dynaimic prefetch has no holes at all.

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Clear cookies after the test. This currently doesn't happen automatically.
    await using _ = defer(() => browser.deleteCookies())

    const act = createRouterAct(page)

    await browser.addCookie({ name: 'testCookie', value: 'testValue' })

    // Reveal the link to trigger a runtime prefetch for page one
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="runtime"][data-link-accordion="/runtime-prefetchable-layout/one"]`
      )
      await linkToggle.click()
    }, [
      // should prefetch page one, and allow reading cookies
      {
        includes: 'Cookie from page: testValue',
      },
    ])

    // Navigate to page one. It should have been completely prefetched by the runtime prefetch.
    await act(async () => {
      await browser
        .elementByCss(`a[href="/runtime-prefetchable-layout/one"]`)
        .click()
    }, 'no-requests')

    await browser.back()

    // Reveal the link to trigger an auto prefetch for page two
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-prefetch="auto"][data-link-accordion="/runtime-prefetchable-layout/two"]`
      )
      await linkToggle.click()
    }, [
      // Should not fetch the shared layout, because that was already prefetched
      {
        includes: 'Shared layout',
        block: 'reject',
      },
      // Should fetch the static part of page two
      { includes: 'Page two' },
    ])

    // Navigate to page two. We need to request the page segment dynamically, but the shared layout should be cached.
    await act(async () => {
      await browser
        .elementByCss(`a[href="/runtime-prefetchable-layout/two"]`)
        .click()
    }, [
      // Should not fetch the shared layout, because we already got a complete result for it.
      {
        includes: 'Cookie from layout',
        block: 'reject',
      },
      // Should fetch the page, which we haven't prefetched before.
      {
        includes: 'Dynamic content from page two',
      },
    ])

    // After navigating, we should see both the parts that we prefetched and dynamic content.
    expect(await browser.elementByCss('h2').text()).toEqual('Shared layout')
    expect(await browser.elementByCss('h1').text()).toEqual('Page two')
    expect(await browser.elementById('cookie-value-layout').text()).toEqual(
      'Cookie from layout: testValue'
    )
    expect(await browser.elementById('cookie-value-page').text()).toEqual(
      'Cookie from page: testValue'
    )
    expect(await browser.elementById('dynamic-content-page').text()).toEqual(
      'Dynamic content from page two'
    )
  })

  describe('segment-level prefetch config', () => {
    const clientNavigateToSegmentConfigPage = async (
      browser: NextBrowser,
      act: ReturnType<typeof createRouterAct>
    ) => {
      // Reveal the link to trigger a (automatic) runtime prefetch for the segment-config entrypoint page
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/segment-config/runtime-prefetchable"]`
        )
        await linkToggle.click()
      }, [
        {
          includes: 'runtime-prefetchable-content-layout',
        },
      ])

      // Navigate to the segment-config entrypoint page.
      // The layout is configured as runtime prefetchable, but the page is not.
      // Both contain runtime-prefetchable content,
      // but nothing dynamic, so we shouldn't need any extra requests.
      //
      // Note that the page itself doesn't specify that it should use a runtime prefetch,
      // but we'll currently automatically include it in the runtime prefetch request
      // that we're doing because of the layout's config.
      await act(async () => {
        await browser
          .elementByCss(`a[href="/segment-config/runtime-prefetchable"]`)
          .click()
      }, 'no-requests')
    }

    it('does not unnecessarily use a runtime prefetch for sub-pages of runtime-prefetchable layouts', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })

      const act = createRouterAct(page)

      // First, we move from the starting page to another page that has a runtime-prefetchable layout.
      await clientNavigateToSegmentConfigPage(browser, act)

      // Now we're on a page that uses the runtime-prefetchable layout,
      // sub-pages of the same layout that are configured as static shouldn't automatically issue a runtime prefetch.
      await act(async () => {
        await browser
          .elementByCss(
            `input[data-link-accordion="/segment-config/runtime-prefetchable/configured-as-static"]`
          )
          .click()
      }, [
        // We should not prefetch anything from the parent layout again.
        { includes: 'static-content-layout', block: 'reject' },
        { includes: 'runtime-prefetchable-content-layout', block: 'reject' },

        // We should prefetch the static content for the page, but nothing more.
        { includes: 'static-content-page' },
        { includes: 'dynamic-content-page', block: 'reject' },
        { includes: 'runtime-prefetchable-content-page', block: 'reject' },
      ])
    })

    it('statically prefetches a fully-static page segment if all its runtime-prefetchable parents are available', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })

      const act = createRouterAct(page)

      // First, we move from the starting page to another page that has a runtime-prefetchable layout.
      await clientNavigateToSegmentConfigPage(browser, act)

      // Now we're on a page that uses the runtime-prefetchable layout,
      // sub-pages of the same layout that are configured as static shouldn't automatically issue a runtime prefetch.
      await act(async () => {
        await browser
          .elementByCss(
            `input[data-link-accordion="/segment-config/runtime-prefetchable/fully-static"]`
          )
          .click()
      }, [
        // We should not prefetch anything from the parent layout again.
        { includes: 'static-content-layout', block: 'reject' },
        { includes: 'runtime-prefetchable-content-layout', block: 'reject' },

        // We should prefetch the static content for the page, but nothing more.
        { includes: 'static-content-page' },
      ])

      // The page segment is fully static, so we shouldn't need any extra requests to navigate to it.
      await act(async () => {
        await browser
          .elementByCss(
            `a[href="/segment-config/runtime-prefetchable/fully-static"]`
          )
          .click()
      }, 'no-requests')

      expect(
        await (await browser.elementById('static-content-page')).isVisible()
      ).toBeTrue()
    })

    it('uses a runtime prefetch for sub-pages of runtime-prefetchable layouts if requested', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })

      const act = createRouterAct(page)

      // First, we move from the starting page to another page that has a runtime-prefetchable layout.
      await clientNavigateToSegmentConfigPage(browser, act)

      // Sub-pages of this layout that are configured as runtime-prefetchable should be prefetched as such.
      // However, if the page also has a sub-layout (not shared with the current page)
      // that is configured as static, that part shouldn't be runtime-prefetched.
      //
      // Note that this is a sub-optimal configuration -- in a real app, we'd likely want the sub-layout
      // to be runtime-prefetched as well, because it contains some runtime-prefetchable content.
      // However, this is deliberately set up this way to assert that we don't do a runtime prefetch unless requested.
      await act(async () => {
        await browser
          .elementByCss(
            `input[data-link-accordion="/segment-config/runtime-prefetchable/configured-as-runtime"]`
          )
          .click()
      }, [
        // We should not prefetch anything from the parent layout again.
        { includes: 'static-content-layout', block: 'reject' },
        { includes: 'runtime-prefetchable-content-layout', block: 'reject' },

        {
          // We should *not* prefetch the runtime parts of the sub-layout,
          // because it's not configured as runtime-prefetchable.
          includes: 'runtime-prefetchable-content-sub-layout',
          block: 'reject',
        },

        // ...but we should prefetch the runtime parts of the page.
        { includes: 'runtime-prefetchable-content-page' },
        { includes: 'dynamic-content-page', block: 'reject' },
      ])

      // Navigate to the runtime-prefetchable sub-page.
      await act(async () => {
        // We should be able to display what we've prefetched before the navigation request resolves.
        await act(async () => {
          await browser
            .elementByCss(
              `a[href="/segment-config/runtime-prefetchable/configured-as-runtime"]`
            )
            .click()
        }, 'block')

        // The sub-layout should show static content, but not runtime-prefetchable content.
        expect(
          await (
            await browser.elementById('static-content-sub-layout')
          ).isVisible()
        ).toBeTrue()
        expect(
          await (
            await browser.elementById(
              'runtime-prefetchable-fallback-sub-layout'
            )
          ).isVisible()
        ).toBeTrue()

        // The sub-page should show static/runtime-prefetchable content.
        expect(
          await (await browser.elementById('static-content-page')).isVisible()
        ).toBeTrue()
        expect(
          await (
            await browser.elementById('runtime-prefetchable-content-page')
          ).isVisible()
        ).toBeTrue()
      })

      // After the navigation, we should see the content that wasn't prefetched.
      // (because the sub-layout was configured as static)
      expect(
        await (
          await browser.elementById('runtime-prefetchable-content-sub-layout')
        ).isVisible()
      ).toBeTrue()
    })
  })
})

function defer(callback: () => Promise<void>) {
  return {
    [Symbol.asyncDispose]: callback,
  }
}
