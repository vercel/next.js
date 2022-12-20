import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'async-component-preload',
  {
    files: path.join(__dirname, 'async-component-preload'),
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle redirect in an async page', async () => {
      const browser = await next.browser('/')
      expect(await browser.waitForElementByCss('#success').text()).toBe(
        'Success'
      )
    })
  }
)
