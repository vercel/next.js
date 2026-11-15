import { nextTestSetup } from 'e2e-utils'

describe('Module Init Error', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render error page', async () => {
      const browser = await next.browser('/')
      const text = await browser.waitForElementByCss('#error-p').text()
      expect(text).toBe('Error Rendered')
    })
  })
})
