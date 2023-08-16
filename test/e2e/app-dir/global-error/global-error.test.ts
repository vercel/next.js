import { getRedboxHeader, hasRedbox } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - global error',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    it('should trigger error component when an error happens during rendering', async () => {
      const browser = await next.browser('/throw')
      await browser
        .waitForElementByCss('#error-trigger-button')
        .elementByCss('#error-trigger-button')
        .click()

      if (isNextDev) {
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatch(/Error: Client error/)
      } else {
        await browser
        expect(await browser.elementByCss('#error').text()).toBe(
          'Error message: Client error'
        )
      }
    })
  }
)
