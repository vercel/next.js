import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

createNextDescribe(
  'app dir - error-boundary-reset-fetch',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Reseting should only re-render the error boundary, the data should be the same so it should still be an error
    it('should not show the header after reseting the error', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('button#reset').click()
      await waitFor(750)
      await browser.elementByCss('button#reset')
    })

    // Refreshing should re-render the segment, the data should be new without error
    it('should show the header after refreshing the router', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('button#refresherrorboundary').click()

      await check(
        () => browser.elementByCss('nav#refresherrorboundary').text(),
        'Refresh error boundary: Hello, world!'
      )
    })
  }
)
