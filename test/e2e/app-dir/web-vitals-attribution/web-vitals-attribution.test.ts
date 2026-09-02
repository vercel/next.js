import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('web-vitals-attribution', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include attribution for metrics listed in experimental.webVitalsAttribution', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const metrics: Array<{ name: string; attributionKeys: string[] | null }> =
        await browser.eval('window.__metrics || []')
      const fcp = metrics.find((metric) => metric.name === 'FCP')
      expect(fcp).toBeDefined()
      expect(fcp.attributionKeys).not.toBeNull()
      expect(fcp.attributionKeys.length).toBeGreaterThan(0)
    }, 10000)
  })

  it('should not include attribution for metrics not listed in experimental.webVitalsAttribution', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const metrics: Array<{ name: string; attributionKeys: string[] | null }> =
        await browser.eval('window.__metrics || []')
      const ttfb = metrics.find((metric) => metric.name === 'TTFB')
      expect(ttfb).toBeDefined()
      expect(ttfb.attributionKeys).toBeNull()
    }, 10000)
  })
})
