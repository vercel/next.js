import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('turbopack-worker-public-path', () => {
  const { next, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // The fixture configures `experimental.turbopackWorkerPublicPath`, a
  // turbopack-only option that does not apply to webpack builds.
  if (!isTurbopack) {
    it.skip('skipped in webpack mode (turbopackWorkerPublicPath is turbopack-only)', () => {})
    return
  }

  it('Worker URL uses workerPublicPath, not assetPrefix', async () => {
    const pageErrors: unknown[] = []
    const browser = await next.browser('/', {
      beforePageLoad: (page: {
        on: (event: string, listener: (err: unknown) => void) => void
      }) => {
        page.on('pageerror', (error: unknown) => {
          pageErrors.push(error)
        })
      },
    })

    await retry(async () => {
      const url = await browser.elementByCss('#worker-url').text()
      expect(url).not.toBe('')
      // The Worker constructor URL must NOT include the CDN-like assetPrefix.
      expect(url).not.toContain('/cdn-prefix')
    })

    await retry(async () => {
      const location = await browser.elementByCss('#worker-location').text()
      expect(location).not.toBe('')
      // The worker successfully loaded and reported its own origin; the
      // reported href must also be outside the /cdn-prefix namespace.
      expect(location).not.toContain('/cdn-prefix')
    })

    // Cross-origin Worker construction would produce a page-level SecurityError.
    expect(pageErrors).toEqual([])
  })
})
