import { createNext, isNextDeploy } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

// `experimental.turbopackWorkerAssetPrefix` is turbopack-only.
const isTurbopack = !process.env.IS_WEBPACK_TEST
const describeTurbopack =
  isTurbopack && !isNextDeploy ? describe : describe.skip

// CORS so cross-origin script tags from `assetPrefix` can be fetched. Workers
// are NOT covered by CORS — `new Worker(crossOriginUrl)` is rejected
// regardless — so this only unblocks regular script loading.
const corsHeaders = () => ({
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
})

/**
 * Real cross-origin setup: the page is served at `http://localhost:PORT/`,
 * `assetPrefix` points to `http://127.0.0.1:PORT` (different origin —
 * browsers treat `localhost` and `127.0.0.1` as distinct origins). Both
 * resolve to the same Next.js server bound to all interfaces.
 *
 * The fixture intercepts `new Worker()` to capture the URL the turbopack
 * runtime helper resolved from `turbopackWorkerAssetPrefix`, so each test
 * can assert on that URL directly.
 */
describeTurbopack('turbopack-worker-asset-prefix', () => {
  describe('without turbopackWorkerAssetPrefix (cross-origin assetPrefix)', () => {
    let next: NextInstance
    let forcedPort: string

    beforeAll(async () => {
      forcedPort = String((await findPort()) ?? '54321')
      next = await createNext({
        files: __dirname,
        forcedPort,
        nextConfig: {
          assetPrefix: `http://127.0.0.1:${forcedPort}`,
          ...corsHeaders(),
        },
      })
    })
    afterAll(() => next.destroy())

    it('Worker URL inherits assetPrefix and the browser rejects construction', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const url = await browser.elementByCss('#worker-ctor-url').text()
        expect(url).toContain('http://127.0.0.1:')
        expect(url).toContain(`:${forcedPort}/`)
      })

      // Cross-origin Worker construction throws SecurityError synchronously.
      await retry(async () => {
        const error = await browser.elementByCss('#worker-ctor-error').text()
        expect(error).toBe('SecurityError')
      })
    })
  })

  describe('with turbopackWorkerAssetPrefix overriding assetPrefix', () => {
    let next: NextInstance
    let forcedPort: string

    beforeAll(async () => {
      forcedPort = String((await findPort()) ?? '54322')
      next = await createNext({
        files: __dirname,
        forcedPort,
        nextConfig: {
          assetPrefix: `http://127.0.0.1:${forcedPort}`,
          experimental: {
            // Route Worker URLs through the page's own origin
            // (`http://localhost:PORT`) instead of the cross-origin assetPrefix.
            turbopackWorkerAssetPrefix: `http://localhost:${forcedPort}`,
          },
          ...corsHeaders(),
        },
      })
    })
    afterAll(() => next.destroy())

    it('Worker URL uses the override origin and construction succeeds', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const pageOrigin = await browser.elementByCss('#page-origin').text()
        const url = await browser.elementByCss('#worker-ctor-url').text()
        expect(pageOrigin).toBe(`http://localhost:${forcedPort}`)
        expect(url.startsWith(pageOrigin)).toBe(true)
        expect(url).not.toContain('127.0.0.1')
      })

      const error = await browser.elementByCss('#worker-ctor-error').text()
      expect(error).toBe('(none)')
    })
  })

  describe('with turbopackWorkerAssetPrefix: "" (literal empty prefix)', () => {
    let next: NextInstance
    let forcedPort: string

    beforeAll(async () => {
      forcedPort = String((await findPort()) ?? '54323')
      next = await createNext({
        files: __dirname,
        forcedPort,
        nextConfig: {
          assetPrefix: `http://127.0.0.1:${forcedPort}`,
          experimental: {
            // Empty string is a literal empty prefix (only `/_next/` is
            // appended). It does NOT fall back to assetPrefix — only
            // `undefined` does.
            turbopackWorkerAssetPrefix: '',
          },
          ...corsHeaders(),
        },
      })
    })
    afterAll(() => next.destroy())

    it('Worker URL is a relative /_next/ URL (resolved same-origin)', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const pageOrigin = await browser.elementByCss('#page-origin').text()
        const url = await browser.elementByCss('#worker-ctor-url').text()
        expect(pageOrigin).toBe(`http://localhost:${forcedPort}`)
        // URL passed to `new Worker(...)` lives on the page's origin, not
        // assetPrefix. (Internally the runtime resolves the relative
        // `/_next/...` against `location.origin`.)
        expect(url.startsWith(pageOrigin)).toBe(true)
        expect(url).not.toContain('127.0.0.1')
      })

      const error = await browser.elementByCss('#worker-ctor-error').text()
      expect(error).toBe('(none)')
    })
  })
})
