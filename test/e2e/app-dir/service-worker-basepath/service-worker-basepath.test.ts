import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a
// Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'app dir - service worker with basePath',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('registers and serves the worker under the basePath', async () => {
      const browser = await next.browser('/base')

      await retry(async () => {
        expect(await browser.elementByCss('#sw-controller').text()).toBe(
          'controlled'
        )
      })

      // The registration scope and served URL must both include the basePath.
      const scope = await browser.elementByCss('#sw-scope').text()
      expect(new URL(scope).pathname).toBe('/base')

      const script = await browser.elementByCss('#sw-script').text()
      expect(script).toBe('/base/_next/static/service-worker/sw.js')

      const res = await next.fetch('/base/_next/static/service-worker/sw.js')
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('max-age=0')
      expect(res.headers.get('cache-control')).not.toContain('immutable')
      expect(res.headers.get('service-worker-allowed')).toBeTruthy()
    })
  }
)
