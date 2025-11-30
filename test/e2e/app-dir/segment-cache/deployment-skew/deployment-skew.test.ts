import type * as Playwright from 'playwright'
import webdriver from 'next-webdriver'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { isNextDeploy, isNextDev } from 'e2e-utils'
import { build, start } from './servers.mjs'

describe('segment cache (deployment skew)', () => {
  if (isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  // To debug these tests locally, first build the app:
  //   node build.mjs
  //
  // Then start:
  //   node start.mjs
  //
  // This will build two versions of the same app on different ports, then
  // start a proxy server that rewrites incoming requests to one or the other
  // based on the request information.

  let cleanup: () => Promise<void>
  let port: number

  beforeAll(async () => {
    build()
    const proxyPort = (port = await findPort())
    const nextPort1 = await findPort()
    const nextPort2 = await findPort()
    cleanup = await start(proxyPort, nextPort1, nextPort2)
  })

  afterAll(async () => {
    await cleanup()
  })

  it(
    'does not crash when prefetching a dynamic, non-PPR page ' +
      'on a different deployment',
    async () => {
      // Reproduces a bug that occurred when prefetching a dynamic page
      // from a different deployment, when PPR is disabled. Once PPR is the
      // default, it's OK to rewrite this to use the latest APIs.
      let act
      const browser = await webdriver(port, '/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch of link to a different deployment
      await act(async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/dynamic-page?deployment=2"]'
        )
        await checkbox.click()
      })

      // Navigate to the target page
      const link = await browser.elementByCss(
        'a[href="/dynamic-page?deployment=2"]'
      )
      await link.click()

      // Should have performed a full-page navigation to the new deployment.
      const buildId = await browser.elementById('build-id')
      expect(await buildId.text()).toBe('Build ID: 2')
    },
    60 * 1000
  )

  it(
    'does not crash when prefetching a static page on a different deployment',
    async () => {
      // Same as the previous test, but for a static page
      let act
      const browser = await webdriver(port, '/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch of link to a different deployment
      await act(async () => {
        const checkbox = await browser.elementByCss(
          '[data-link-accordion="/static-page?deployment=2"]'
        )
        await checkbox.click()
      })

      // Navigate to the target page
      const link = await browser.elementByCss(
        'a[href="/static-page?deployment=2"]'
      )
      await link.click()

      // Should have performed a full-page navigation to the new deployment.
      const buildId = await browser.elementById('build-id')
      expect(await buildId.text()).toBe('Build ID: 2')
    },
    60 * 1000
  )
})
