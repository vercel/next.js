import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import type { Playwright } from 'next-webdriver'

/**
 * Helper to verify no connection errors occurred in the browser console.
 * Used to detect issues where HTTP error handling causes premature stream closure.
 */
async function expectNoConnectionErrors(browser: Playwright): Promise<void> {
  const logs = await browser.log()
  const connectionClosedErrors = logs.filter(
    (log: { message: string }) =>
      log.message.includes('Connection closed') ||
      log.message.includes('client-side exception')
  )
  expect(connectionClosedErrors).toHaveLength(0)
}

describe('cache-components', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should not have route specific errors', async () => {
    expect(next.cliOutput).not.toMatch('Error: Route "/')
    expect(next.cliOutput).not.toMatch('Error occurred prerendering page')
  })

  if (isNextDev) {
    it('should not log not-found errors', async () => {
      const cliOutputLength = next.cliOutput.length
      await next.browser('/cases/not-found')
      const cliOutput = next.cliOutput.slice(cliOutputLength)
      expect(cliOutput).not.toMatch('Error: NEXT_HTTP_ERROR_FALLBACK;404')
      expect(cliOutput).not.toMatch('unhandledRejection')
    })
  } else {
    it('should not warn about potential memory leak for even listeners on AbortSignal', async () => {
      expect(next.cliOutput).not.toMatch('MaxListenersExceededWarning')
    })
  }

  it('should prerender fully static pages', async () => {
    let $ = await next.render$('/cases/static', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/static_async', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender static not-found pages', async () => {
    // Using `browser` instead of `render$` because error pages must be hydrated
    // apparently.
    const browser = await next.browser('/cases/not-found')

    if (isNextDev) {
      expect(await browser.elementById('layout').text()).toBe('at runtime')
      expect(await browser.elementById('page').text()).toBe('at runtime')
    } else {
      expect(await browser.elementById('layout').text()).toBe('at buildtime')
      expect(await browser.elementById('page').text()).toBe('at buildtime')
    }
  })

  it('should handle not-found thrown in a Suspense boundary', async () => {
    // This tests that notFound() works correctly when thrown inside a Suspense
    // boundary during streaming. The not-found page should be rendered properly
    // without "Connection closed" errors.
    const browser = await next.browser('/cases/not-found-suspense')

    // Wait for the not-found component to appear
    const notFoundText = await browser
      .waitForElementByCss('#not-found-component')
      .text()
    expect(notFoundText).toBe('Not Found from Suspense!')

    // Check that there are no console errors about "Connection closed"
    await expectNoConnectionErrors(browser)
  })

  it('should handle not-found with async component in layout Suspense boundary', async () => {
    // This tests the exact reproduction case from the issue:
    // - notFound() called directly in page
    // - Async component wrapped in Suspense in layout
    // - cacheComponents: true
    // The not-found page should render and the async component should also render.
    const browser = await next.browser('/cases/not-found-with-layout-suspense')

    // Wait for the not-found component to appear
    const notFoundHeading = await browser
      .waitForElementByCss('#not-found-heading')
      .text()
    expect(notFoundHeading).toBe('404 - Page Not Found')

    // The async component in the layout should also render
    const asyncData = await browser.waitForElementByCss('#async-data').text()
    expect(asyncData).toBe('Data: Fetched Data')

    // Check that there are no console errors about "Connection closed"
    await expectNoConnectionErrors(browser)
  })

  it('should handle forbidden with async component in layout Suspense boundary', async () => {
    // This tests that forbidden() works correctly with cacheComponents
    // - forbidden() called directly in page
    // - Async component wrapped in Suspense in layout
    // - cacheComponents: true + authInterrupts: true
    // The forbidden page should render and the async component should also render.
    const browser = await next.browser('/cases/forbidden-with-layout-suspense')

    // Wait for the forbidden component to appear
    const forbiddenHeading = await browser
      .waitForElementByCss('#forbidden-heading')
      .text()
    expect(forbiddenHeading).toBe('403 - Forbidden')

    // The async component in the layout should also render
    const asyncData = await browser.waitForElementByCss('#async-data').text()
    expect(asyncData).toBe('Data: Fetched Data')

    // Check that there are no console errors about "Connection closed"
    await expectNoConnectionErrors(browser)
  })

  it('should handle unauthorized with async component in layout Suspense boundary', async () => {
    // This tests that unauthorized() works correctly with cacheComponents
    // - unauthorized() called directly in page
    // - Async component wrapped in Suspense in layout
    // - cacheComponents: true + authInterrupts: true
    // The unauthorized page should render and the async component should also render.
    const browser = await next.browser(
      '/cases/unauthorized-with-layout-suspense'
    )

    // Wait for the unauthorized component to appear
    const unauthorizedHeading = await browser
      .waitForElementByCss('#unauthorized-heading')
      .text()
    expect(unauthorizedHeading).toBe('401 - Unauthorized')

    // The async component in the layout should also render
    const asyncData = await browser.waitForElementByCss('#async-data').text()
    expect(asyncData).toBe('Data: Fetched Data')

    // Check that there are no console errors about "Connection closed"
    await expectNoConnectionErrors(browser)
  })

  it('should prerender pages that render in a microtask', async () => {
    let $ = await next.render$('/cases/microtask', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/microtask_deep_tree', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that take longer than a task to render', async () => {
    let $ = await next.render$('/cases/task', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // The inner slot is computed during the prerender but is hidden
      // it gets revealed when the resume happens
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that only use cached fetches', async () => {
    const $ = await next.render$('/cases/fetch_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that use at least one fetch without cache', async () => {
    let $ = await next.render$('/cases/fetch_mixed', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that only use cached (unstable_cache) IO', async () => {
    const $ = await next.render$('/cases/io_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that only use cached ("use cache") IO', async () => {
    const $ = await next.render$('/cases/use_cache_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should prerender pages that cached the whole page', async () => {
    const $ = await next.render$('/cases/full_cached', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that do any uncached IO', async () => {
    let $ = await next.render$('/cases/io_mixed', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that do any uncached IO (use cache)', async () => {
    let $ = await next.render$('/cases/use_cache_mixed', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that use `cookies()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_cookies', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
      expect($('#value').text()).toBe('hello')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
      expect($('#value').text()).toBe('hello')
    }
  })

  it('should partially prerender pages that use `headers()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_headers')
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
      expect($('#value').text()).toBe('hello')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
      expect($('#value').text()).toBe('hello')
    }
  })

  it('should fully prerender pages that use `unstable_noStore()`', async () => {
    let $ = await next.render$('/cases/dynamic_api_no_store', {})
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
    }
  })

  it('should partially prerender pages that use `searchParams` in Server Components', async () => {
    let $ = await next.render$(
      '/cases/dynamic_api_search_params_server?sentinel=my+sentinel',
      {}
    )
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
      expect($('#value').text()).toBe('my sentinel')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      expect($('#inner').text()).toBe('at buildtime')
      expect($('#value').text()).toBe('my sentinel')
    }
  })

  it('should partially prerender pages that use `searchParams` in Client Components', async () => {
    let $ = await next.render$(
      '/cases/dynamic_api_search_params_client?sentinel=my+sentinel',
      {}
    )
    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      expect($('#inner').text()).toBe('at runtime')
      expect($('#value').text()).toBe('my sentinel')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // The second component renders before the first one aborts so we end up
      // capturing the static value during buildtime
      expect($('#inner').text()).toBe('at buildtime')
      // Since there was no dynamic data access on this page, the search params
      // are completely ommitted from the HTML document and filled in by
      // the client
      expect($('#value').text()).toBe('')
      expect($('#fallback-component-one-').text()).toBe('loading...')
    }
  })

  it('can prerender pages with parallel routes that are static', async () => {
    const $ = await next.render$('/cases/parallel/static', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('can prerender pages with parallel routes that resolve in a microtask', async () => {
    const $ = await next.render$('/cases/parallel/microtask', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('does not prerender pages with parallel routes that resolve in a task', async () => {
    const $ = await next.render$('/cases/parallel/task', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('does not prerender pages with parallel routes that uses a dynamic API', async () => {
    let $ = await next.render$('/cases/parallel/no-store', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at buildtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }

    $ = await next.render$('/cases/parallel/cookies', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page-slot').text()).toBe('at runtime')
      expect($('#page-children').text()).toBe('at buildtime')
    }
  })

  it('should not resume when client components are dynamic but the RSC render was static', async () => {
    let html = await next.render('/cases/static-rsc-dynamic-client', {})
    const $ = cheerio.load(html)

    // Confirm the HTML document was sent completely
    expect(html).toContain('</body></html>')

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
      // In dev we SSR the time
      expect($('#time').length).toBe(1)
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
      // Confirm the time span is not part of the completed HTML document
      expect($('#time').length).toBe(0)
    }

    const browser = await next.browser('/cases/static-rsc-dynamic-client')

    const now = new Date()

    if (isNextDev) {
      expect(await browser.elementById('layout').text()).toBe('at runtime')
      expect(await browser.elementById('page').text()).toBe('at runtime')
      // Assert that we rendered a time within the last couple seconds.
      const inPageDate = new Date(
        await browser.waitForElementByCss('#time').text()
      )
      expect(inPageDate.getTime() - now.getTime()).toBeLessThan(2000)
    } else {
      expect(await browser.elementById('layout').text()).toBe('at buildtime')
      expect(await browser.elementById('page').text()).toBe('at buildtime')
      // Assert that we rendered a time within the last 2 seconds.
      const inPageDate = new Date(
        await browser.waitForElementByCss('#time').text()
      )
      expect(inPageDate.getTime() - now.getTime()).toBeLessThan(2000)
    }
  })
})
