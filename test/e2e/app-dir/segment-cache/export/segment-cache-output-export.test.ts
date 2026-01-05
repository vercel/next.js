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

  // Test for https://github.com/vercel/next.js/issues/88032
  // Multiple Links with the same href but different prefetch values should
  // all work correctly in output: "export" mode.
  it('navigate using link with prefetch={true} when another link with default prefetch exists', async () => {
    let act
    const browser = await webdriver(port, '/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Make both links visible (one with default prefetch, one with prefetch={true})
    // The RSC response contains "Blog: " and "post-1" as separate elements
    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-multi-prefetch-accordion="/blog/post-1"]'
        )
        await checkbox.click()
      },
      {
        includes: 'blog-post',
      }
    )

    // Navigate using the link with prefetch={true}
    // This should work correctly even though there's another link with default prefetch
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[data-link-force-prefetch][href="/blog/post-1"]'
        )
        await link.click()

        // The page should be navigated to
        const div = await browser.elementById('blog-post')
        expect(await div.text()).toContain('Blog: post-1')
      },
      {
        // Should have prefetched the home page
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })

  it('navigate using link with default prefetch when another link with prefetch={true} exists', async () => {
    let act
    const browser = await webdriver(port, '/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Make both links visible
    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          '[data-multi-prefetch-accordion="/blog/post-1"]'
        )
        await checkbox.click()
      },
      {
        includes: 'blog-post',
      }
    )

    // Navigate using the link with default prefetch
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[data-link-default][href="/blog/post-1"]'
        )
        await link.click()

        // The page should be navigated to
        const div = await browser.elementById('blog-post')
        expect(await div.text()).toContain('Blog: post-1')
      },
      {
        // Should have prefetched the home page
        includes: 'Demonstrates that per-segment prefetching works',
      }
    )
  })
})
