import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

describe('route cancel via CSS', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should cancel slow page loads on re-navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('#link-1').click()
      await waitFor(3000)
      expect(await browser.hasElementByCssSelector('#page-text')).toBeFalsy()

      await browser.elementByCss('#link-2').click()
      await waitFor(3000)

      const text2 = await browser.elementByCss('#page-text').text()
      expect(text2).toMatch(/2/)
      expect(await browser.eval('window.routeCancelled')).toBe('yes')
    })
  })
})
