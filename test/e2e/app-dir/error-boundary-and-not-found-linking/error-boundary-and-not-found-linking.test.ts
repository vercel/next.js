import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'not-found-linking',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should allow navigation on not-found', async () => {
      const browser = await next.browser('/trigger-404')
      expect(await browser.elementByCss('#not-found-component').text()).toBe(
        'Not Found!'
      )

      expect(
        await browser
          .elementByCss('#to-result')
          .click()
          .waitForElementByCss('#result-page')
          .text()
      ).toBe('Result Page!')
    })

    it('should allow navigation on error', async () => {
      const browser = await next.browser('/trigger-error')
      expect(await browser.elementByCss('#error-component').text()).toBe(
        'Error Happened!'
      )

      expect(
        await browser
          .elementByCss('#to-result')
          .click()
          .waitForElementByCss('#result-page')
          .text()
      ).toBe('Result Page!')
    })
  }
)
