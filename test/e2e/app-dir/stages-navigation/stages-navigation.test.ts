import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('unstable_navigation() (stages)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Prefetching (and thus unstable_navigation()'s observable behavior) is
    // not meaningful in dev, so this suite only runs against a production
    // build.
    it('is not relevant in dev', () => {})
    return
  }

  async function startBrowser(url: string) {
    let page!: Playwright.Page
    const browser = await next.browser(url, {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    // Include App Shell requests in assertions: for pages without params, the
    // static shell content arrives in the App Shell prefetch, and `block:
    // 'reject'` assertions must cover *every* prefetch response, including
    // the App Shell.
    const act = createRouterAct(page, { includeAppShellRequests: true })
    return { browser, act }
  }

  it('has no effect on fully static pages: content below `await unstable_navigation()` is included in the prefetch', async () => {
    const { browser, act } = await startBrowser('/')

    // Reveal the link to trigger a full prefetch (the link uses
    // `prefetch={true}`). The page is fully static and the route does not opt
    // into runtime prefetching, so no runtime prefetch happens — and
    // unstable_navigation() is a no-op during static prerendering. Both the
    // above- and below-gate content are part of the static output and arrive
    // in the prefetch responses. (We don't assert on the prefetch bodies
    // directly because the static content can appear in more than one
    // prefetch response; instead, the 'no-requests' navigation below proves
    // everything was already prefetched.)
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/basic"]'
      )
      await toggle.click()
    })

    // Navigate. The entire page — including the content below
    // `await unstable_navigation()` — is served from the prefetch cache
    // without any additional requests.
    await act(async () => {
      await browser.elementByCss('a[href="/basic"]').click()
    }, 'no-requests')

    expect(await browser.elementById('above-navigation').text()).toBe(
      'Above navigation content'
    )
    expect(await browser.elementById('below-navigation').text()).toBe(
      'Below navigation content'
    )
  })

  it('renders content below `await unstable_navigation()` on initial load', async () => {
    // On a hard navigation (initial load), the content below the gate renders
    // like any other content. (On a fully static page it's part of the static
    // output to begin with.)
    const browser = await next.browser('/basic')
    expect(await browser.elementById('above-navigation').text()).toBe(
      'Above navigation content'
    )
    expect(await browser.elementById('below-navigation').text()).toBe(
      'Below navigation content'
    )
  })

  it('excludes content below `await unstable_navigation()` from runtime prefetches', async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal the link to trigger a prefetch. The route opts into runtime
    // prefetching (`prefetch = 'partial'`), so in addition to the static
    // prefetch, a runtime prefetch is issued, which is allowed to read request
    // data like cookies. The cookie-derived content proves the runtime
    // prefetch happened; the gated content must not appear in any prefetch
    // response — unstable_navigation() excludes it from the runtime prefetch,
    // and it's nested below the cookies() read, so a static prefetch never
    // reaches it.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch"]'
      )
      await toggle.click()
    }, [
      // The cookie-derived content above `await unstable_navigation()` is
      // included in the runtime prefetch. (It cannot appear in a static
      // prefetch, which is not allowed to read cookies.)
      { includes: 'Cookie: initialValue' },
      // The content below `await unstable_navigation()` must not appear in
      // any prefetch response, including the runtime prefetch.
      { includes: 'Runtime gated content', block: 'reject' },
    ])

    // Navigate. The navigation response fills in the gated content.
    await act(
      async () => {
        await browser.elementByCss('a[href="/runtime-prefetch"]').click()
      },
      { includes: 'Runtime gated content' }
    )

    expect(await browser.elementById('cookie-value').text()).toBe(
      'Cookie: initialValue'
    )
    expect(await browser.elementById('gated-content').text()).toBe(
      'Runtime gated content'
    )
  })

  it("supports cached content below unstable_navigation() when the 'use cache' directive is on an inner function", async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal the link to trigger a prefetch. The route opts into runtime
    // prefetching, and the page reads cookies, so a runtime prefetch fires
    // and renders runtime content. The cached-but-not-gated content IS
    // included in the runtime prefetch; only the subtree behind
    // `await unstable_navigation()` is excluded. This is the canonical
    // pattern for combining unstable_navigation() with "use cache": the
    // uncached wrapper awaits unstable_navigation(), then calls a "use cache"
    // function (awaiting unstable_navigation() *inside* a cache scope is an
    // error).
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/workaround"]'
      )
      await toggle.click()
    }, [
      // The runtime prefetch contains the cookie-derived content...
      { includes: 'Workaround cookie: initialValue' },
      // ...and the cached content that isn't behind the gate...
      { includes: 'Cached visible content' },
      // ...but not the gated cached data.
      { includes: 'Cached workaround data', block: 'reject' },
    ])

    // Navigate. The gated cached data renders as part of the navigation.
    await act(
      async () => {
        await browser.elementByCss('a[href="/workaround"]').click()
      },
      { includes: 'Cached workaround data' }
    )

    expect(await browser.elementById('cookie-value').text()).toBe(
      'Workaround cookie: initialValue'
    )
    expect(await browser.elementById('cached-visible').text()).toBe(
      'Cached visible content'
    )
    expect(await browser.elementById('gated-data').text()).toBe(
      'Cached workaround data'
    )
  })

  it('shows the Suspense fallback for gated content while the navigation response is pending', async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal the link. The runtime prefetch includes the cookie-derived
    // content but excludes the content below `await unstable_navigation()`.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch"]'
        )
        await toggle.click()
      },
      { includes: 'Cookie: initialValue' }
    )

    // Navigate, but block the navigation response that contains the gated
    // content. While it's pending, the prefetched content should already be
    // visible: the cookie-derived content from the runtime prefetch, and the
    // Suspense fallback in place of the gated content.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/runtime-prefetch"]').click()
        },
        {
          // Temporarily block the navigation response. It's fulfilled when
          // the outer `act` scope completes.
          includes: 'Runtime gated content',
          block: true,
        }
      )
      expect(await browser.elementById('cookie-value').text()).toBe(
        'Cookie: initialValue'
      )
      expect(await browser.elementById('gated-fallback').text()).toBe(
        'Loading gated content...'
      )
    })

    // Once the navigation response is released, the gated content replaces
    // the fallback.
    expect(await browser.elementById('gated-content').text()).toBe(
      'Runtime gated content'
    )
  })

  it('includes content below `await unstable_navigation()` in a `prefetch="navigation"` prefetch', async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal the navigation-depth link. `prefetch="navigation"` issues a
    // runtime prefetch that renders past `await unstable_navigation()`, so
    // unlike a default runtime prefetch, the gated content is included in the
    // prefetch response, alongside the cookie-derived content above the gate.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch"][data-prefetch="navigation"]'
      )
      await toggle.click()
    }, [
      { includes: 'Cookie: initialValue' },
      { includes: 'Runtime gated content' },
    ])

    // Navigate. The entire page — including the gated content — is served
    // from the prefetch cache without any additional requests.
    await act(async () => {
      await browser.elementByCss('a[href="/runtime-prefetch"]').click()
    }, 'no-requests')

    expect(await browser.elementById('cookie-value').text()).toBe(
      'Cookie: initialValue'
    )
    expect(await browser.elementById('gated-content').text()).toBe(
      'Runtime gated content'
    )
  })

  it('does not prefetch again when a `prefetch="navigation"` link targets a route whose runtime prefetch deferred nothing', async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal a full-prefetch (`prefetch={true}`) link to /runtime-ungated.
    // The route opts into runtime prefetching, so in addition to the App
    // Shell prefetch this issues a standalone runtime prefetch for the page.
    // The page has no `await unstable_navigation()` gate, so the runtime
    // prefetch renders the entire page — nothing is deferred at the
    // navigation stage. The response records this, and the client marks the
    // cached entries as navigation-complete.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-ungated"][data-prefetch="true"]'
      )
      await toggle.click()
    }, [
      // The cookie-derived content appears once in the App Shell prefetch
      // response and once in the runtime prefetch response.
      { includes: 'Ungated cookie: initialValue' },
      { includes: 'Ungated cookie: initialValue' },
    ])

    // Reveal the navigation-depth link to the same route. Because the earlier
    // runtime prefetch deferred nothing, its entries were recorded as
    // navigation-complete, so a deeper prefetch would yield nothing new — no
    // request is issued.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-ungated"][data-prefetch="navigation"]'
      )
      await toggle.click()
    }, 'no-requests')

    // Navigate. The page is fully served from the prefetch cache.
    await act(async () => {
      await browser.elementByCss('a[href="/runtime-ungated"]').click()
    }, 'no-requests')

    expect(await browser.elementById('ungated-cookie-value').text()).toBe(
      'Ungated cookie: initialValue'
    )
  })

  it('prefetches deeper when a `prefetch="navigation"` link targets a route whose runtime prefetch deferred gated content', async () => {
    const { browser, act } = await startBrowser('/')
    // Clear cookies after the test. This currently doesn't happen
    // automatically.
    await using _ = defer(() => browser.deleteCookies())

    await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

    // Reveal a full-prefetch (`prefetch={true}`) link to /runtime-prefetch.
    // In addition to the App Shell prefetch, this issues a standalone runtime
    // prefetch, which includes the cookie-derived content but defers the
    // content below `await unstable_navigation()`. Because content was
    // deferred, the response records it and the cached entries are not
    // navigation-complete.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch"][data-prefetch="true"]'
      )
      await toggle.click()
    }, [
      // The cookie-derived content appears once in the App Shell prefetch
      // response and once in the runtime prefetch response.
      { includes: 'Cookie: initialValue' },
      { includes: 'Cookie: initialValue' },
      // The gated content must not appear in any prefetch response.
      { includes: 'Runtime gated content', block: 'reject' },
    ])

    // Reveal the navigation-depth link to the same route. The existing
    // entries are not navigation-complete, so a deeper prefetch can provide
    // more content: a new, navigation-depth prefetch fires and includes the
    // gated content.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch"][data-prefetch="navigation"]'
        )
        await toggle.click()
      },
      { includes: 'Runtime gated content' }
    )

    // Navigate. Everything is now served from the prefetch cache.
    await act(async () => {
      await browser.elementByCss('a[href="/runtime-prefetch"]').click()
    }, 'no-requests')

    expect(await browser.elementById('cookie-value').text()).toBe(
      'Cookie: initialValue'
    )
    expect(await browser.elementById('gated-content').text()).toBe(
      'Runtime gated content'
    )
  })
})

function defer(callback: () => Promise<void>) {
  return {
    [Symbol.asyncDispose]: callback,
  }
}
