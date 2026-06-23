import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Production Usage', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

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
