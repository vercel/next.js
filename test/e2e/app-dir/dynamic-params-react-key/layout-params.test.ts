import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - params keys',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should keep the React router instance the same when changing dynamic params', async () => {
      const browser = await next.browser('/en')

      const params = browser.waitForElementByCss('#params').text()
      await browser.elementByCss('#increment').click()
      await browser.elementByCss('#increment').click()

      await browser.elementByCss('#push').click()

      await check(async () => {
        const newParams = await browser.waitForElementByCss('#params').text()

        const count = await browser.waitForElementByCss('#count').text()

        return newParams !== params && count === '2' ? 'success' : 'retry'
      }, 'success')
    })
  }
)
