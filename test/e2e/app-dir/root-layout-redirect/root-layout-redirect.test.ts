import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'root-layout-redirect',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work using browser', async () => {
      const browser = await next.browser('/')

      expect(
        await browser
          .elementByCss('#trigger-redirect')
          .click()
          .waitForElementByCss('#result')
          .text()
      ).toBe('Result Page')

      const browserLogs = await browser.log('browser')

      let foundErrors = false

      browserLogs.forEach((log) => {
        if (log.source === 'error') {
          foundErrors = true
        }
      })

      expect(foundErrors).toBe(false)
    })
  }
)
