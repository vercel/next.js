import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Top Level Error', () => {
  describe('production mode', () => {
    describe('with getInitialProps', () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'with-get-initial-props'),
        skipDeployment: true,
      })
      if (skipped) return

      it('should render error page with getInitialProps', async () => {
        const browser = await next.browser('/')
        const text = await browser.waitForElementByCss('#error-p').text()
        expect(text).toBe('Error Rendered with: top level error')
      })
    })

    describe('without getInitialProps', () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'without-get-initial-props'),
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
})
