import type * as Playwright from 'playwright'
import webdriver from 'next-webdriver'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { isNextDeploy, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { build, start } from './servers.mjs'

describe('segment cache (deployment skew)', () => {
  if (isNextDev) {
    test('should not run during dev', () => {})
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

  if (isNextStart) {
    let cleanup: () => Promise<void>
    let port: number

    describe('with BUILD_ID', () => {
      beforeAll(async () => {
        build('BUILD_ID')
        const proxyPort = (port = await findPort())
        const nextPort1 = await findPort()
        const nextPort2 = await findPort()
        cleanup = await start(proxyPort, nextPort1, nextPort2, 'BUILD_ID')
      })

      afterAll(async () => {
        await cleanup()
      })

      runTests(() => port)
    })

    describe('with NEXT_DEPLOYMENT_ID', () => {
      beforeAll(async () => {
        build('DEPLOYMENT_ID')
        const proxyPort = (port = await findPort())
        const nextPort1 = await findPort()
        const nextPort2 = await findPort()
        cleanup = await start(proxyPort, nextPort1, nextPort2, 'DEPLOYMENT_ID')
      })

      afterAll(async () => {
        await cleanup()
      })

      runTests(() => port)
    })
  }

  describe('header with deployment id', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        // rely on skew protection when deployed
        NEXT_DEPLOYMENT_ID: isNextDeploy ? undefined : 'test-deployment-id',
      },
    })

    // Deployment skew is hard to properly e2e deploy test, so this just checks for the header.
    it('header is set on RSC responses', async () => {
      for (const route of ['/dynamic-page', '/static-page']) {
        await next.fetch(route)
        let res = await next.fetch(`${route}?_rsc=`, {
          headers: { rsc: '1' },
        })

        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('text/x-component')
        expect(res.headers.get('x-nextjs-deployment-id')).toBeTruthy()
      }
    })
  })
})

function runTests(getPort: () => number) {
  it(
    'does not crash when prefetching a dynamic, non-PPR page ' +
      'on a different deployment',
    async () => {
      // Reproduces a bug that occurred when prefetching a dynamic page
      // from a different deployment, when PPR is disabled. Once PPR is the
      // default, it's OK to rewrite this to use the latest APIs.
      let act
      const browser = await webdriver(getPort(), '/', {
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
      const browser = await webdriver(getPort(), '/', {
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
}
