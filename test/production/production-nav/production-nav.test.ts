import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Production Usage', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should navigate forward and back correctly', async () => {
      const browser = await next.browser('/')
      await browser.eval('window.beforeNav = true')
      await browser.elementByCss('#to-another').click()
      // waitForElement doesn't seem to work properly in safari 10
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#to-index')).toBe(true)
      })
      expect(await browser.eval('window.beforeNav')).toBe(true)
      await browser.elementByCss('#to-index').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#to-another')).toBe(true)
      })
      expect(await browser.eval('window.beforeNav')).toBe(true)
    })
  })
})
