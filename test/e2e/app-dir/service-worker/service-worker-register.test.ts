import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a Turbopack-only feature.
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

      // The worker is served under `/_next/static/service-worker/` but registers at the whole
      // origin: the codegen pins `{ scope: '/' }` and the response carries `Service-Worker-Allowed`.
      const scope = await browser.elementByCss('#sw-scope').text()
      expect(new URL(scope).pathname).toBe('/')

      // A single service worker per scope is served at a fixed URL under the static folder.
      const script = await browser.elementByCss('#sw-script').text()
      expect(script).toBe('/_next/static/service-worker/sw.js')
    })

    it('serves the worker chunk as a revalidated, mutable asset', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#sw-script').text()).toBe(
          '/_next/static/service-worker/sw.js'
        )
      })

      const res = await next.fetch('/_next/static/service-worker/sw.js')
      expect(res.status).toBe(200)
      // Stable URL across builds: it must be served as a mutable asset (never
      // immutable) that is revalidated on every use, so a new worker ships
      // immediately rather than being pinned by a long-lived cache entry.
      const cacheControl = res.headers.get('cache-control')
      expect(cacheControl).not.toContain('immutable')
      expect(cacheControl).toContain('max-age=0')

      // It registers at a broader scope than its own directory, so the response must
      // carry `Service-Worker-Allowed` or the browser rejects the registration.
      expect(res.headers.get('service-worker-allowed')).toBe('/')

      // Revalidated on every use, so it must ship an ETag to turn those
      // revalidations into cheap 304s instead of re-downloading the worker body.
      const etag = res.headers.get('etag')
      expect(etag).toBeTruthy()

      // A conditional re-fetch with the ETag returns 304 Not Modified (no body),
      // confirming we don't over-fetch an unchanged worker.
      const conditional = await next.fetch(
        '/_next/static/service-worker/sw.js',
        {
          headers: { 'If-None-Match': etag },
        }
      )
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
