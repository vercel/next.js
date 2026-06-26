import { nextTestSetup } from 'e2e-utils'

describe.each(['edge', 'nodejs'])(
  'dynamic-css-client-navigation dynamic import %s',
  (runtime) => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it(`should not remove style when navigating from static imported component to dynamic import at runtime ${runtime}`, async () => {
      const browser = await next.browser(`/${runtime}`)
      expect(
        await browser
          .elementByCss(`a[href="/${runtime}/dynamic-import"]`)
          .click()
          .waitForElementByCss('#red-button')
          .text()
      ).toBe('Red Button')

      const buttonBgColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('button')).backgroundColor`
      )

      expect(buttonBgColor).toBe('rgb(255, 0, 0)')
    })
  }
)
