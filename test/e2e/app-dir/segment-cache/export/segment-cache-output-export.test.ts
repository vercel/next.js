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
