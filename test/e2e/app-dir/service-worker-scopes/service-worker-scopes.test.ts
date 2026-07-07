import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Compiling `navigator.serviceWorker.register(new URL(...))` is a
// Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'app dir - service worker (one worker per scope)',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('serves one worker per scope at scope-derived file names', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(await browser.elementByCss('#root-scope').text()).toBe('/')
      })
      await retry(async () => {
        expect(await browser.elementByCss('#offline-scope').text()).toBe(
          '/offline/mode'
        )
      })

      // The root scope "/" is served unhashed at /sw.js. Both workers are served
      // as mutable, always-revalidated assets (never immutable).
      const root = await next.fetch('/sw.js')
      expect(root.status).toBe(200)
      expect(root.headers.get('cache-control')).toContain('max-age=0')
      expect(root.headers.get('cache-control')).not.toContain('immutable')

      // scope "/offline/mode" -> a distinct, scope-derived file name. The slug is
      // lossy, so a hash of the scope is appended to keep file names unique.
      let offlineScript = ''
      await retry(async () => {
        offlineScript = await browser.elementByCss('#offline-script').text()
        expect(offlineScript).toMatch(/^\/sw-offline-mode-[0-9a-f]+\.js$/)
      })

      const offline = await next.fetch(offlineScript)
      expect(offline.status).toBe(200)
      expect(offline.headers.get('cache-control')).toContain('max-age=0')
      expect(offline.headers.get('cache-control')).not.toContain('immutable')
    })
  }
)
