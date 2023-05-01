import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - search params keys',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should keep the React router instance the same when changing the search params', async () => {
      const browser = await next.browser('/')

      const searchParams = browser.waitForElementByCss('#search-params').text()
      const id = await browser.elementByCss('#random-number').text()
      await browser.elementByCss('#push').click()

      await check(async () => {
        const newSearchParams = await browser
          .waitForElementByCss('#search-params')
          .text()
        const newId = await browser.elementByCss('#random-number').text()

        return newSearchParams !== searchParams && id === newId
          ? 'success'
          : 'retry'
      }, 'success')

      await browser.elementByCss('#replace').click()

      await check(async () => {
        const newSearchParams = await browser
          .waitForElementByCss('#search-params')
          .text()
        const newId = await browser.elementByCss('#random-number').text()

        return newSearchParams !== searchParams && id === newId
          ? 'success'
          : 'retry'
      }, 'success')
    })
  }
)
