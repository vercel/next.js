import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { findPort, retry } from 'next-test-utils'
import { isNextDeploy, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { build, start } from './servers.mjs'

describe('segment cache (deployment skew)', () => {
  if (isNextDev) {
    test('should not run during dev', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      // rely on skew protection when deployed
      NEXT_DEPLOYMENT_ID: isNextDeploy ? undefined : 'test-deployment-id',
    },
    disableAutoSkewProtection: true,
  })

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

      runTests(next, 'BUILD_ID', () => port)
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

      runTests(next, 'DEPLOYMENT_ID', () => port)
    })
  }

  describe('header with deployment id', () => {
    beforeAll(async () => {
      await next.start()
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

function runTests(
  next: ReturnType<typeof nextTestSetup>['next'],
  mode: 'BUILD_ID' | 'DEPLOYMENT_ID',
  getPort: () => number
) {
  it(
    'does not crash when prefetching a dynamic, non-PPR page ' +
      'on a different deployment',
    async () => {
      // Reproduces a bug that occurred when prefetching a dynamic page
      // from a different deployment, when PPR is disabled. Once PPR is the
      // default, it's OK to rewrite this to use the latest APIs.
      let act
      const browser = await next.browser('/', {
        baseUrl: getPort(),
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
      const browser = await next.browser('/', {
        baseUrl: getPort(),
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

  it(
    'triggers MPA navigation when a server action redirects to a different deployment',
    async () => {
      // Verify that when a server action calls redirect() and the redirect
      // target is served by a different deployment (different build ID), the
      // client falls back to an MPA navigation instead of attempting to apply
      // the foreign RSC payload.
      const browser = await next.browser('/', { baseUrl: getPort() })
      await browser.eval('window.next.router.push("/action-redirect")')
      await browser.waitForElementByCss('#action-page')
      let sawActionRequest = false
      let sawRedirectActionResponse = false
      let actionResponseDeploymentId: string | undefined
      browser.on('request', (request: Playwright.Request) => {
        const headers = request.headers()
        if (request.method() === 'POST' && headers['next-action']) {
          sawActionRequest = true
        }
      })
      browser.on('response', async (response: Playwright.Response) => {
        const request = response.request()
        if (request.method() !== 'POST') {
          return
        }

        const headers = response.headers()
        if (headers['x-action-redirect']) {
          sawRedirectActionResponse = true
          actionResponseDeploymentId = headers['x-nextjs-deployment-id']
        }
      })

      // Verify we're on the action redirect page
      const heading = await browser.elementById('action-page')
      expect(await heading.text()).toBe('Action Redirect Page')

      // Click the button that triggers the server action redirect.
      // In deployment ID mode, the proxy injects a foreign
      // x-nextjs-deployment-id header to simulate skew. In build ID mode,
      // the response omits that header so the client falls back to the
      // build ID carried in the action Flight payload.
      const button = await browser.elementById('redirect-action-button')
      await button.click()

      await retry(async () => {
        expect(sawActionRequest).toBe(true)
      })

      await retry(async () => {
        expect(sawRedirectActionResponse).toBe(true)
      })

      if (mode === 'DEPLOYMENT_ID') {
        expect(actionResponseDeploymentId).toBe('foreign-deployment')
      } else {
        expect(actionResponseDeploymentId).toBeUndefined()
      }

      // Wait for the navigation to complete.
      // The client detects the mismatch in either the response header or
      // the fallback build ID field and discards the flight data,
      // triggering an MPA navigation (full page load) to the redirect
      // target. The redirect URL (/dynamic-page?deployment=2) goes through
      // the proxy to deployment 2.
      const buildId = await browser.waitForElementByCss('#build-id')
      expect(await buildId.text()).toBe('Build ID: 2')
    },
    60 * 1000
  )
}
