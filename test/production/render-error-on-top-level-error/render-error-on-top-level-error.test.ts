import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Top Level Error', () => {
  describe('production mode', () => {
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // No deploy-specific incompatibility is documented.
    // @force-gate !deploy
    describe('with getInitialProps', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'with-get-initial-props'),
      })

      it('should render error page with getInitialProps', async () => {
        const browser = await next.browser('/')
        const text = await browser.waitForElementByCss('#error-p').text()
        expect(text).toBe('Error Rendered with: top level error')
      })
    })

    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // No deploy-specific incompatibility is documented.
    // @force-gate !deploy
    describe('without getInitialProps', () => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'without-get-initial-props'),
      })

      it('should render error page', async () => {
        const browser = await next.browser('/')
        const text = await browser.waitForElementByCss('#error-p').text()
        expect(text).toBe('Error Rendered')
      })
    })
  })
})
