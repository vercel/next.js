import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'async-component-preload',
  {
    files: __dirname,
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
