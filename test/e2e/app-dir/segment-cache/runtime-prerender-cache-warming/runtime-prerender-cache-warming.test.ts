import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

const CACHE_MISS_WARNING = 'Unexpected cache miss after cache warming phase'

// Deploy mode exclusion: This suite asserts local server CLI output.
// @force-gate !deploy
describe('runtime prerender cache warming', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it.skip('no prefetching in dev', () => {})
    return
  }

  it('does not report a cache miss when prefetching the shell of a cached page that reads static params', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Load the App Shell for /slug/[slug].
    // Shells cannot access params, so the page gets them as a hanging input.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/slug/prerendered"]')
        .click()
    }, [
      {
        includes: 'Slug: prerendered',
        block: 'reject',
      },
    ])

    // The App Shell request renders the runtime shell of the /slug/[slug] route.
    // The page is a `'use cache'` page that awaits static params and params
    // should be a hanging input in the final prerender.
    // If the prospective (cache-warming) prerender resolved params instead of
    // leaving them hanging, the cached page's key would differ between the two
    // prerenders and the final prerender would log an "Unexpected cache miss"
    // warning and degrade the cached segment to a dynamic hole.
    expect(next.cliOutput).not.toContain(CACHE_MISS_WARNING)

    // When we navigate, params become available.
    await act(() => browser.elementByCss('a[href="/slug/prerendered"]').click())
    expect(await browser.elementById('slug').text()).toEqual(
      'Slug: prerendered'
    )
  })

  it('prefetch() is a hanging input when passed to a cache in a runtime shell', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Load the App Shell for the page.
    // It should include the result of the cache.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/pass-prefetch-to-cache"]')
        .click()
    }, [
      {
        includes: 'Cached data',
        kind: 'runtime',
      },
    ])

    expect(next.cliOutput).not.toContain(CACHE_MISS_WARNING)

    // Navigate, but capture the result of the cache as shown in the shell.
    const cachedDataInShell = await act(async () => {
      await browser.elementByCss('a[href="/pass-prefetch-to-cache"]').click()
      return browser.elementByCss('#cached-data').text()
    })

    // prefetch() was a hanging input in the shell, but resolves in a navigation,
    // so the keys don't match and we should get a fresh cache result.
    const cachedDataInNavigation = await browser
      .elementByCss('#cached-data')
      .text()
    expect(cachedDataInShell).not.toEqual(cachedDataInNavigation)
  })

  it('navigation() is a hanging input when passed to a cache in both a runtime shell and prefetch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Prefetch the page.
    // It should include the result of the cache.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/pass-navigation-to-cache"]')
        .click()
    }, [
      // We assert on shells and prefetch behavior in one go,
      // because the router fetches both, in two request.
      // Shell
      {
        includes: 'Cached data',
        kind: 'runtime',
      },
      // Prefetch
      {
        includes: 'Cached data',
        kind: 'runtime',
      },
    ])

    expect(next.cliOutput).not.toContain(CACHE_MISS_WARNING)

    // Navigate, but capture the result of the cache as shown in the shell.
    const cachedDataInShell = await act(async () => {
      await browser.elementByCss('a[href="/pass-navigation-to-cache"]').click()
      return browser.elementByCss('#cached-data').text()
    })

    // navigation() was a hanging input in the shell, but resolves in a navigation,
    // so the keys don't match and we should get a fresh cache result.
    const cachedDataInNavigation = await browser
      .elementByCss('#cached-data')
      .text()
    expect(cachedDataInShell).not.toEqual(cachedDataInNavigation)
  })

  it('caches hidden behind prefetch() are not warmed when rendering a runtime shell', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })
    const beforeShellIx = next.cliOutput.length

    // Load the shell for the page.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/lazy-data-in-shell"]')
        .click()
    }, [
      {
        includes: 'This page gates caches behind prefetch and navigation.',
        kind: 'runtime',
      },
      {
        includes: 'Prefetch data',
        block: 'reject',
      },
      {
        includes: 'Navigation data',
        block: 'reject',
      },
    ])

    // The caches should not have been warmed, because the prospective prerender
    // for a shell shouldn't resolve prefetch() or navigation().
    const shellLogs = next.cliOutput.slice(beforeShellIx)
    expect(shellLogs).not.toContain('cachedFn :: after prefetch')
    expect(shellLogs).not.toContain('cachedFn :: after navigation')

    const beforeNavigationIx = next.cliOutput.length
    // Navigate, which should run the caches and thus print the logs.
    await act(() =>
      browser.elementByCss('a[href="/lazy-data-in-shell"]').click()
    )
    const navigationLogs = next.cliOutput.slice(beforeNavigationIx)
    expect(navigationLogs).toContain('cachedFn :: after prefetch')
    expect(navigationLogs).toContain('cachedFn :: after navigation')
  })

  it('caches hidden behind navigation() are not warmed when rendering a runtime shell or prefetch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })
    const beforePrefetchIx = next.cliOutput.length

    // Load the shell for the page.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/lazy-data-in-prefetch"]')
        .click()
    }, [
      // Shell
      {
        includes: 'This page gates caches behind prefetch and navigation.',
        kind: 'runtime',
      },
      // Prefetch
      {
        includes: 'Prefetch data',
        kind: 'runtime',
      },
      {
        includes: 'Navigation data',
        block: 'reject',
      },
    ])

    const shellAndPrefetchLogs = next.cliOutput.slice(beforePrefetchIx)
    // The cache behind prefetch() should've been warmed in the prefetch request.
    expect(shellAndPrefetchLogs).toContain('cachedFn :: after prefetch')
    // The cache behind navigation() should not have been warmed.
    expect(shellAndPrefetchLogs).not.toContain('cachedFn :: after navigation')

    const beforeNavigationIx = next.cliOutput.length

    // Navigate, which should run the caches and thus print the logs.
    await act(() =>
      browser.elementByCss('a[href="/lazy-data-in-prefetch"]').click()
    )
    const navigationLogs = next.cliOutput.slice(beforeNavigationIx)
    // Already warmed by the prefetch request, and logs are not replayed.
    expect(navigationLogs).not.toContain('cachedFn :: after prefetch')
    // New in this request.
    expect(navigationLogs).toContain('cachedFn :: after navigation')
  })

  describe('hanging props in cached pages in runtime shells', () => {
    it('a public-cache page that awaits params becomes dynamic during a runtime shell prerender', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Load the shell for the page.
      // It contains a public cache that reads params, which are not available in a shell.
      await act(async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/params-in-public-cache/1"]'
          )
          .click()
      }, [
        // The Shell should only the fallback for the page, not the page itself --
        // The cache entry should be aborted as dynamic during cache filling,
        // otherwise it would hang and time out.
        {
          includes: 'page-loading',
          kind: 'runtime',
        },
        {
          includes: 'Slug:',
          block: 'reject',
        },
      ])

      expectNoCacheFillTimeout(next.cliOutput)

      // Navigate.
      await act(async () => {
        await browser
          .elementByCss('a[href="/params-in-public-cache/1"]')
          .click()
        // The page is blocking, so we should show loading.tsx instead.
        expect(await browser.elementByCss('#page-loading').text()).toEqual(
          'Loading page...'
        )
      })

      // After navigating, the full cache entry (including the param) should be visible.
      expect(await browser.elementByCss('#slug').text()).toEqual('Slug: 1')
    })

    it('a private-cache page that awaits params becomes dynamic during a runtime shell prerender', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Load the shell for the page.
      // It contains a private cache that reads params, which are not available in a shell.
      await act(async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/params-in-private-cache/1"]'
          )
          .click()
      }, [
        // The Shell should only the fallback for the page, not the page itself --
        // The cache entry should be aborted as dynamic during cache filling,
        // otherwise it would hang and time out.
        {
          includes: 'page-loading',
          kind: 'runtime',
        },
        {
          includes: 'Slug:',
          block: 'reject',
        },
      ])

      expectNoCacheFillTimeout(next.cliOutput)

      // Navigate.
      await act(async () => {
        await browser
          .elementByCss('a[href="/params-in-private-cache/1"]')
          .click()
        // The page is blocking, so we should show loading.tsx instead.
        expect(await browser.elementByCss('#page-loading').text()).toEqual(
          'Loading page...'
        )
      })

      // After navigating, the full cache entry (including the param) should be visible.
      expect(await browser.elementByCss('#slug').text()).toEqual('Slug: 1')
    })

    it('a private-cache page that awaits search params becomes dynamic during a runtime shell prerender', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Load the shell for the page.
      // It contains a private cache that reads params, which are not available in a shell.
      await act(async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/search-params-in-private-cache?foo=bar"]'
          )
          .click()
      }, [
        // The Shell should only the fallback for the page, not the page itself --
        // The cache entry should be aborted as dynamic during cache filling,
        // otherwise it would hang and time out.
        {
          includes: 'page-loading',
          kind: 'runtime',
        },
        {
          includes: 'Search:',
          block: 'reject',
        },
      ])

      expectNoCacheFillTimeout(next.cliOutput)

      // Navigate.
      await act(async () => {
        await browser
          .elementByCss('a[href="/search-params-in-private-cache?foo=bar"]')
          .click()
        // The page is blocking, so we should show loading.tsx instead.
        expect(await browser.elementByCss('#page-loading').text()).toEqual(
          'Loading page...'
        )
      })

      // After navigating, the full cache entry (including the search params) should be visible.
      expect(await browser.elementByCss('#search').text()).toEqual(
        `Search: ${JSON.stringify({ foo: 'bar' })}`
      )
    })
  })
})

function expectNoCacheFillTimeout(cliOutput: string) {
  expect(cliOutput).not.toContain('Filling a cache during prerender timed out')
}
