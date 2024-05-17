import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - search params keys', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should keep the React router instance the same when changing the search params', async () => {
    const browser = await next.browser('/')

    const searchParams = browser.waitForElementByCss('#search-params').text()
    await browser.elementByCss('#increment').click()
    await browser.elementByCss('#increment').click()

    await browser.elementByCss('#push').click()

    await retry(async () => {
      const newSearchParams = await browser
        .waitForElementByCss('#search-params')
        .text()

      const count = await browser.waitForElementByCss('#count').text()

      expect(newSearchParams !== searchParams && count === '2').toBeTruthy()
    })

    await browser.elementByCss('#increment').click()
    await browser.elementByCss('#increment').click()

    await browser.elementByCss('#replace').click()

    await retry(async () => {
      const newSearchParams = await browser
        .waitForElementByCss('#search-params')
        .text()
      const count = await browser.waitForElementByCss('#count').text()

      expect(newSearchParams !== searchParams && count === '4').toBeTruthy()
    })
  })
})
