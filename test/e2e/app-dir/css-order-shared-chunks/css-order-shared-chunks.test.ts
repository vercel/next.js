import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This test verifies Turbopack's CSS chunk ordering fix. Webpack has its own
// CSS ordering behavior and this specific interleaved-shared-chunks scenario
// is not yet fixed there.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'css-order-shared-chunks',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should preserve CSS cascade order on route A with shared chunks', async () => {
      const browser = await next.browser('/a')
      // unique-a-final.module.css is imported last, so its color should win
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(0, 128, 0)')
      })
    })

    it('should preserve CSS cascade order on route B with shared chunks', async () => {
      const browser = await next.browser('/b')
      // unique-b-final.module.css is imported last, so its color should win
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(128, 0, 128)')
      })
    })

    it('should preserve order when navigating from A to B', async () => {
      const browser = await next.browser('/a')
      // Verify A first
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(0, 128, 0)')
      })

      // Navigate to B
      await browser.elementByCss('a[href="/b"]').click()
      await browser.waitForElementByCss('#target')
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(128, 0, 128)')
      })
    })

    it('should preserve order when navigating from B to A', async () => {
      const browser = await next.browser('/b')
      // Verify B first
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(128, 0, 128)')
      })

      // Navigate to A
      await browser.elementByCss('a[href="/a"]').click()
      await browser.waitForElementByCss('#target')
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.getElementById('target')).color`
          )
        ).toBe('rgb(0, 128, 0)')
      })
    })
  }
)
