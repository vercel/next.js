import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a
// Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'app dir - service worker register',
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

      // Served from the origin root, so the registration scope is the whole origin
      // with no Service-Worker-Allowed header needed.
      const scope = await browser.elementByCss('#sw-scope').text()
      expect(new URL(scope).pathname).toBe('/')

      // A single service worker per app is served at the fixed, root-scoped /sw.js.
      const script = await browser.elementByCss('#sw-script').text()
      expect(script).toBe('/sw.js')
    })

    it('serves the worker chunk at the root as a revalidated, mutable asset', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#sw-script').text()).toBe('/sw.js')
      })

      const res = await next.fetch('/sw.js')
      expect(res.status).toBe(200)
      // Stable URL across builds: it must be served as a mutable asset (never
      // immutable) that is revalidated on every use, so a new worker ships
      // immediately rather than being pinned by a long-lived cache entry.
      const cacheControl = res.headers.get('cache-control')
      expect(cacheControl).not.toContain('immutable')
      expect(cacheControl).toContain('max-age=0')

      // Revalidated on every use, so it must ship an ETag to turn those
      // revalidations into cheap 304s instead of re-downloading the worker body.
      const etag = res.headers.get('etag')
      expect(etag).toBeTruthy()

      // A conditional re-fetch with the ETag returns 304 Not Modified (no body),
      // confirming we don't over-fetch an unchanged worker.
      const conditional = await next.fetch('/sw.js', {
        headers: { 'If-None-Match': etag },
      })
      expect(conditional.status).toBe(304)
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
