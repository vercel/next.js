import { nextTestSetup } from 'e2e-utils'

describe('Module Init Error', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('should render error page', async () => {
      const browser = await next.browser('/')
      const text = await browser.waitForElementByCss('#error-p').text()
      expect(text).toBe('Error Rendered')
    })
  })
})
