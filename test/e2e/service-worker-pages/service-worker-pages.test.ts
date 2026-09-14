import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a
// Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'pages dir - service worker register',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('registers the service worker and controls the page at scope "/"', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(await browser.elementByCss('#sw-controller').text()).toBe(
          'controlled'
        )
      })

      const scope = await browser.elementByCss('#sw-scope').text()
      expect(new URL(scope).pathname).toBe('/')

      const script = await browser.elementByCss('#sw-script').text()
      expect(script).toBe('/_next/static/service-worker/sw.js')
    })

    it('serves the worker chunk as a revalidated, mutable asset', async () => {
      const res = await next.fetch('/_next/static/service-worker/sw.js')
      expect(res.status).toBe(200)
      const cacheControl = res.headers.get('cache-control')
      expect(cacheControl).not.toContain('immutable')
      expect(cacheControl).toContain('max-age=0')
      expect(res.headers.get('service-worker-allowed')).toBe('/')
    })

    it('intercepts fetches within scope', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(await browser.elementByCss('#sw-controller').text()).toBe(
          'controlled'
        )
      })

      await browser.elementByCss('button').click()

      await retry(async () => {
        expect(await browser.elementByCss('#fetch-result').text()).toBe(
          'intercepted-by-sw'
        )
      })
    })
  }
)
