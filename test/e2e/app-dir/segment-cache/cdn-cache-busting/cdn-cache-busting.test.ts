import type * as Playwright from 'playwright'
import webdriver from 'next-webdriver'
import { createRouterAct } from 'router-act'
import { findPort, nextBuild } from 'next-test-utils'
import { isNextDeploy, isNextDev } from 'e2e-utils'
import { start } from './server.mjs'

describe('segment cache (CDN cache busting)', () => {
  if (isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  // TODO(runtime-ppr): add tests for runtime prefetches

  // To debug these tests locally, run:
  //   node start.mjs
  //
  // This will start the Next app and also a proxy server that simulates a CDN.
  // Like certain real-world CDNs, our fake CDN doesn't respect the Vary header.
  // It only uses the URL.
  let cleanup: () => Promise<void>
  let port: number

  beforeAll(async () => {
    const appDir = __dirname
    await nextBuild(appDir, undefined, { cwd: appDir })
    const proxyPort = (port = await findPort())
    const nextPort = await findPort()
    cleanup = await start(proxyPort, nextPort)
  })

  afterAll(async () => {
    await cleanup()
  })

  it(
    "perform fully prefetched navigation with a CDN that doesn't respect " +
      'the Vary header',
    async () => {
      let act
      const browser = await webdriver(port, '/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch. Each segment will be prefetched individually,
      // using the pathname of the target page and a custom header specifying
      // the segment. If we didn't also set a cache-busting search param, then
      // the fake CDN used by this test suite would incorrectly use the same
      // entry for every segment, poisoning the cache.
      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      // Navigate to the prefetched target page.
      await act(async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        // The page was prefetched, so we're able to render the target
        // page immediately.
        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )

  it(
    'prevent cache poisoning attacks by responding with a redirect to correct ' +
      'cache busting query param if a custom header is sent during a prefetch ' +
      'without a corresponding cache-busting search param',
    async () => {
      const browser = await webdriver(port, '/')
      const { status, responseUrl, redirected } = await browser.eval(
        async () => {
          const res = await fetch('/target-page', {
            headers: {
              rsc: '1',
              'next-router-prefetch': '1',
              'next-router-segment-prefetch': '/_tree',
            },
          })
          return {
            status: res.status,
            responseUrl: res.url,
            redirected: res.redirected,
          }
        }
      )
      expect(status).toBe(200)
      expect(responseUrl).toContain('_rsc=')
      expect(redirected).toBe(true)
    }
  )

  it(
    'perform fully prefetched navigation when a third-party proxy ' +
      'performs a redirect',
    async () => {
      let act
      const browser = await webdriver(port, '/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/redirect-to-target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      // Navigate to the prefetched target page.
      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        // The page was prefetched, so we're able to render the target
        // page immediately.
        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )
})
