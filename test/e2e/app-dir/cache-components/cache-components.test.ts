import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

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
