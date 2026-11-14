import type * as Playwright from 'playwright'
import type { Server } from 'http'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createExportServer } from './server.mjs'

// Builds and serves the local static export with a custom server-side rewrite.
// @force-gate start
describe('segment cache (output: "export")', () => {
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

  it('fully prefetches an exported route without a runtime server', async () => {
    let act: ReturnType<typeof createRouterAct>
    const requests: string[] = []
    const browser = await next.browser('/', {
      baseUrl: port,
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
        page.on('request', (request) => {
          if (request.headers()['rsc']) {
            requests.push(new URL(request.url()).pathname)
          }
        })
      },
    })

    await browser.eval('window.__navigationMarker = "preserved"')

    await act(
      async () => {
        await browser
          .elementByCss('[data-link-accordion="/full-prefetch-target"]')
          .click()
      },
      { includes: 'Fully prefetched target page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/full-prefetch-target"]').click()
    }, 'no-requests')

    expect(await browser.elementById('full-prefetch-target').text()).toBe(
      'Fully prefetched target page'
    )
    expect(await browser.eval('window.__navigationMarker')).toBe('preserved')
    expect(requests).toContain('/full-prefetch-target/__next._full.txt')
    expect(requests).not.toContain('/full-prefetch-target')
  })

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
})
