import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

createNextDescribe(
  'rewrites and redirects statuses',
  {
    files: __dirname,
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  },
  ({ next }) => {
    // TODO: investigate test failures on deploy
    if ((global as any).isNextDeploy) {
      it('should skip for deploy', () => {})
      return
    }

    describe('Check rewrites and redirects statuses', () => {
      it('should redirect from next.config.js with permanent status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-redirect-before',
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(308)

        const browser = await next.browser('/catch/config-redirect-before')
        await browser.waitForElementByCss('.page_config-redirect-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })

      it('should redirect from next.config.js with 307 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-redirect-307-before',
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(307)

        const browser = await next.browser('/catch/config-redirect-307-before')
        await browser.waitForElementByCss('.page_config-redirect-307-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })

      it('should redirect from next.config.js with 308 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-redirect-308-before',
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(308)

        const browser = await next.browser('/catch/config-redirect-308-before')
        await browser.waitForElementByCss('.page_config-redirect-308-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })

      it('should rewrite from next.config.js with 203 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-rewrite-203-before'
        )
        expect(res.status).toBe(203)

        const browser = await next.browser('/catch/config-rewrite-203-before')
        await browser.waitForElementByCss('.page_config-rewrite-203-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before')
      })

      it('should rewrite from next.config.js with 320 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-rewrite-320-before'
        )
        expect(res.status).toBe(320)

        const browser = await next.browser('/catch/config-rewrite-320-before')
        await browser.waitForElementByCss('.page_config-rewrite-320-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before')
      })

      it('should rewrite from next.config.js with 503 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/config-rewrite-503-before-files'
        )
        expect(res.status).toBe(503)

        const browser = await next.browser(
          '/catch/config-rewrite-503-before-files'
        )
        await browser.waitForElementByCss(
          '.page_config-rewrite-503-before-files'
        )
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before-files')
      })

      it('should rewrite from next.config.js with 404 status', async () => {
        const res = await fetchViaHTTP(next.appPort, '/not-found')
        expect(res.status).toBe(404)

        const browser = await next.browser('/not-found')
        await browser.waitForElementByCss('.page_not_found')
        const url = new URL(await browser.url())
        expect(url.pathname).toBe('/not-found')
      })

      it('should rewrite from middleware with 200 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/middleware-rewrite-before'
        )
        expect(res.status).toBe(200)

        const browser = await next.browser('/catch/middleware-rewrite-before')
        await browser.waitForElementByCss('.page_middleware-rewrite-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-before')
      })

      it('should redirect from middleware with 307 status', async () => {
        const res = await fetchViaHTTP(
          next.appPort,
          '/catch/middleware-redirect-before',
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(307)

        const browser = await next.browser('/catch/middleware-redirect-before')
        await browser.waitForElementByCss('.page_middleware-redirect-after')
        const url = new URL(await browser.url())
        expect(url.pathname).toEndWith('-after')
      })
    })
  }
)
