import type * as Playwright from 'playwright'
import type { Server } from 'http'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createExportServer } from './server.mjs'

describe('segment cache (output: "export")', () => {
  if (!isNextStart) {
    test('build test should not run during dev test run', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    disableAutoSkewProtection: true,
  })

  // To debug these tests locally, first build the app, then run:
  //
  // node start.mjs
  //
  // This will serve the static `/out` directory, and also set up a server-side
  // rewrite, which some of the tests below rely on.

  let port: number
  let server: Server

  beforeAll(async () => {
    await next.build()
    port = await findPort()
    server = createExportServer(join(next.testDir, 'out'))
    server.listen(port)
  })

  afterAll(() => {
    server?.close()
  })

  // A static export can only serve the files the exporter wrote, so every
  // prefetch has to read the per-segment files rather than the page itself.
  // Tests that assert on this open the home page through this helper, which
  // records the pathname of every request the router makes.
  async function loadHomeAndRecordFetches() {
    let act: ReturnType<typeof createRouterAct>
    const fetched: string[] = []
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
        p.on('response', (response) => {
          // Prefetching sends a HEAD request to the page to resolve redirects,
          // so only the GETs describe what the router reads.
          const { pathname } = new URL(response.url())
          if (
            response.request().method() === 'GET' &&
            !pathname.startsWith('/_next/static/')
          ) {
            fetched.push(pathname)
          }
        })
      },
    })
    return { browser, act: act!, fetched }
  }

  it('basic prefetch in output: "export" mode', async () => {
    let act
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/target-page"]'
        )
        await checkbox.click()
      },
      {
        includes: 'Target page',
      }
    )

    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link with prefetch={true}', async () => {
    const { browser, act, fetched } = await loadHomeAndRecordFetches()

    // `kind: 'static'` is the assertion that this fetched per-segment files
    // rather than issuing a dynamic request. A dynamic request would be served
    // the page's HTML document, which happens to contain the same text, so
    // matching on content alone would not tell the two apart.
    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="target-page-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Target page', kind: 'static' }
    )

    // Requesting the page would return its HTML document, which cannot be
    // decoded as Flight.
    expect(fetched).not.toContain('/target-page')

    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link with prefetch={true} to a route with a dynamic param', async () => {
    const { browser, act, fetched } = await loadHomeAndRecordFetches()

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="dynamic-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Dynamic page: first', kind: 'static' }
    )

    expect(fetched).not.toContain('/dynamic/first')

    // The payoff of a prefetch is that the navigation needs no network. This is
    // what makes the assertion above meaningful: a prefetch that fetched the
    // wrong thing would leave the click to fetch the page itself.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/dynamic/first"]')
      await link.click()

      const div = await browser.elementById('dynamic-page')
      expect(await div.text()).toBe('Dynamic page: first')
      expect(new URL(await browser.url()).pathname).toBe('/dynamic/first')
    }, 'no-requests')
  })

  it('prefetch a link with prefetch={true} to a page below nested layouts', async () => {
    const { browser, act, fetched } = await loadHomeAndRecordFetches()

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="nested-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Nested inner page', kind: 'static' }
    )

    // Whatever the router decides to request, at any depth, it has to be a file
    // the exporter wrote. Reading a route path would return an HTML document.
    expect(fetched).not.toContain('/nested/inner')
    expect(fetched).not.toContain('/nested')
    expect(
      fetched.filter(
        (pathname) => pathname !== '/' && !pathname.endsWith('.txt')
      )
    ).toEqual([])

    await act(async () => {
      const link = await browser.elementByCss('a[href="/nested/inner"]')
      await link.click()

      const div = await browser.elementById('nested-inner-page')
      expect(await div.text()).toBe('Nested inner page')
      expect(await browser.elementById('nested-layout').text()).toContain(
        'Nested layout'
      )
      expect(await browser.elementById('inner-layout').text()).toContain(
        'Inner layout'
      )
      expect(new URL(await browser.url()).pathname).toBe('/nested/inner')
    }, 'no-requests')
  })

  it('prefetch a link to a page that is rewritten server side', async () => {
    let act
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/rewrite-to-target-page"]'
        )
        await checkbox.click()
      },
      {
        includes: 'Target page',
      }
    )

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link with prefetch={true} to a page that is rewritten server side', async () => {
    const { browser, act, fetched } = await loadHomeAndRecordFetches()

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="rewrite-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Target page', kind: 'static' }
    )

    // The router does not know about the rewrite, so it asks for segment files
    // under the link's own path and lets the server map them over.
    expect(fetched).not.toContain('/rewrite-to-target-page')

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link to a page that is redirected server side', async () => {
    let act
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/redirect-to-target-page"]'
        )
        await checkbox.click()
      },
      {
        includes: 'Target page',
      }
    )

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link with prefetch={true} to a page that is redirected server side', async () => {
    const { browser, act, fetched } = await loadHomeAndRecordFetches()

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="redirect-eager"]'
        )
        await checkbox.click()
      },
      { includes: 'Target page', kind: 'static' }
    )

    // The HEAD probe resolves the redirect first, so the segment files are read
    // from the destination rather than from the link's own path.
    expect(fetched).not.toContain('/redirect-to-target-page')
    expect(fetched).not.toContain('/target-page')

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        await browser.elementByCss('a[href="/"]')
      },
      {
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })
})
