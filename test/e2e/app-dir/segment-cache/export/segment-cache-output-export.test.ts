import type * as Playwright from 'playwright'
import webdriver from 'next-webdriver'
import { createRouterAct } from 'router-act'
import { findPort, nextBuild } from 'next-test-utils'
import { isNextStart } from 'e2e-utils'
import { server } from './server.mjs'

describe('segment cache (output: "export")', () => {
  if (!isNextStart) {
    test('build test should not run during dev test run', () => {})
    return
  }

  // To debug these tests locally, first build the app, then run:
  //
  // node start.mjs
  //
  // This will serve the static `/out` directory, and also set up a server-side
  // rewrite, which some of the tests below rely on.

  let port: number

  beforeAll(async () => {
    const appDir = __dirname
    await nextBuild(appDir, undefined, { cwd: appDir })
    port = await findPort()
    server.listen(port)
  })

  afterAll(() => {
    server.close()
  })

  it('basic prefetch in output: "export" mode', async () => {
    let act
    const browser = await webdriver(port, '/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Initiate a prefetch
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

    // Navigate to the prefetched target page.
    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        // The page was prefetched, so we're able to render the target
        // page immediately.
        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        // The target page includes a link back to the home page
        await browser.elementByCss('a[href="/"]')
      },
      {
        // Should have prefetched the home page
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link to a page that is rewritten server side', async () => {
    let act
    const browser = await webdriver(port, '/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Initiate a prefetch
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

    // Navigate to the prefetched page.
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-target-page"]'
        )
        await link.click()

        // The page was prefetched, so we're able to render the target
        // page immediately.
        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        // The target page includes a link back to the home page
        await browser.elementByCss('a[href="/"]')
      },
      {
        // Should have prefetched the home page
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('prefetch a link to a page that is redirected server side', async () => {
    let act
    const browser = await webdriver(port, '/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Initiate a prefetch
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

    // Navigate to the prefetched page.
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        // The page was prefetched, so we're able to render the target
        // page immediately.
        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')

        // The target page includes a link back to the home page
        await browser.elementByCss('a[href="/"]')
      },
      {
        // Should have prefetched the home page
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })
})
