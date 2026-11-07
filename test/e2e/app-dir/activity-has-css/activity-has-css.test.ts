import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Activity :has() CSS', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (process.env.__NEXT_CACHE_COMPONENTS !== 'true') {
    it('is skipped when cacheComponents is disabled', () => {})
    return
  }

  it('does not apply :has() rule to page B when navigating from page A', async () => {
    const browser = await next.browser('/page-a')

    await retry(async () => {
      const bgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('[data-testid="status-banner"]')).backgroundColor`
      )
      expect(bgColor).toMatch(/rgb\(185,\s*28,\s*28\)|#b91c1c/)
    })

    await browser.elementByCss('a[href="/page-b"]').click()

    await retry(async () => {
      const bgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('[data-testid="status-banner"]')).backgroundColor`
      )
      expect(bgColor).not.toMatch(/rgb\(185,\s*28,\s*28\)|#b91c1c/)
    })
  })
})
